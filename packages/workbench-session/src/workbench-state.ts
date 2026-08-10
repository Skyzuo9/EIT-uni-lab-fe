import { randomUUID } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

export const WORKBENCH_STATE_SCHEMA_VERSION = 1

const PERSISTENT_ENTRIES = [
  'schema.json',
  'environment.local.json',
  'sessions',
  'agent',
  'audit'
] as const

const STATE_DIRECTORIES = [
  'runtime',
  'logs',
  'sessions',
  'agent',
  'audit',
  'cache',
  'backups',
  'recovery'
] as const

export interface WorkbenchStateManifest {
  schemaVersion: number
  createdAt: string
  migratedAt: string
  recoveredFrom?: string
}

export interface WorkbenchStateQuotas {
  runtime: number
  logs: number
  cache: number
}

export interface WorkbenchStatePreparation {
  root: string
  manifest: WorkbenchStateManifest
  migratedFrom: number | null
  recoveryPath: string | null
  prunedBytes: number
}

export interface WorkbenchStateBackup {
  id: string
  path: string
  createdAt: string
  bytes: number
  schemaVersion: number
}

export interface WorkbenchStateOptions {
  now?: () => Date
  quotas?: Partial<WorkbenchStateQuotas>
  maxBackupBytes?: number
}

const DEFAULT_QUOTAS: WorkbenchStateQuotas = {
  runtime: 512 * 1024 * 1024,
  logs: 256 * 1024 * 1024,
  cache: 1024 * 1024 * 1024
}

export async function prepareWorkbenchState(
  workspacePath: string,
  options: WorkbenchStateOptions = {}
): Promise<WorkbenchStatePreparation> {
  const root = join(resolve(workspacePath), '.unilabos')
  const now = options.now ?? (() => new Date())
  await mkdir(root, { recursive: true })
  await Promise.all(STATE_DIRECTORIES.map(directory =>
    mkdir(join(root, directory), { recursive: true })
  ))

  const schemaPath = join(root, 'schema.json')
  let manifest: WorkbenchStateManifest
  let migratedFrom: number | null = null
  let recoveryPath: string | null = null
  try {
    manifest = parseManifest(await readFile(schemaPath, 'utf8'))
  } catch (error) {
    if (isFileNotFound(error)) {
      manifest = newManifest(now())
      await writeJsonAtomic(schemaPath, manifest)
    } else if (error instanceof WorkbenchStateError) {
      recoveryPath = join(
        root,
        'recovery',
        `corrupt-${timestampId(now())}-${randomUUID()}`
      )
      await mkdir(recoveryPath, { recursive: true })
      await rename(schemaPath, join(recoveryPath, 'schema.json'))
      manifest = {
        ...newManifest(now()),
        recoveredFrom: recoveryPath
      }
      await writeJsonAtomic(schemaPath, manifest)
    } else {
      throw error
    }
  }

  if (manifest.schemaVersion > WORKBENCH_STATE_SCHEMA_VERSION) {
    throw new WorkbenchStateError(
      'unsupported_schema',
      `Workbench state schema ${manifest.schemaVersion} is newer than supported ${WORKBENCH_STATE_SCHEMA_VERSION}`
    )
  }
  if (manifest.schemaVersion < WORKBENCH_STATE_SCHEMA_VERSION) {
    migratedFrom = manifest.schemaVersion
    await createWorkbenchStateBackup(workspacePath, {
      ...options,
      now
    })
    manifest = {
      ...manifest,
      schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
      migratedAt: now().toISOString()
    }
    await writeJsonAtomic(schemaPath, manifest)
  }

  const quotas = { ...DEFAULT_QUOTAS, ...options.quotas }
  const prunedBytes = (await Promise.all(([
    'runtime',
    'logs',
    'cache'
  ] as const).map(directory => pruneDirectoryToQuota(
    join(root, directory),
    quotas[directory]
  )))).reduce((total, bytes) => total + bytes, 0)

  return { root, manifest, migratedFrom, recoveryPath, prunedBytes }
}

export async function createWorkbenchStateBackup(
  workspacePath: string,
  options: WorkbenchStateOptions = {}
): Promise<WorkbenchStateBackup> {
  const root = join(resolve(workspacePath), '.unilabos')
  const now = options.now ?? (() => new Date())
  const id = `backup-${timestampId(now())}-${randomUUID()}`
  const destination = join(root, 'backups', id)
  const maxBytes = options.maxBackupBytes ?? 1024 * 1024 * 1024
  const bytes = await entriesSize(root, PERSISTENT_ENTRIES)
  if (bytes > maxBytes) {
    throw new WorkbenchStateError(
      'backup_quota_exceeded',
      `Persistent Workbench state requires ${bytes} bytes; backup limit is ${maxBytes}`
    )
  }
  await mkdir(destination, { recursive: false })
  for (const entry of PERSISTENT_ENTRIES) {
    const source = join(root, entry)
    if (!await pathExists(source)) continue
    await cp(source, join(destination, entry), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false
    })
  }
  const manifest = await readWorkbenchStateManifest(root)
  const backup: WorkbenchStateBackup = {
    id,
    path: destination,
    createdAt: now().toISOString(),
    bytes,
    schemaVersion: manifest.schemaVersion
  }
  await writeJsonAtomic(join(destination, 'backup.json'), backup)
  return backup
}

export async function restoreWorkbenchStateBackup(
  workspacePath: string,
  backupId: string,
  options: WorkbenchStateOptions = {}
): Promise<WorkbenchStateBackup> {
  if (basename(backupId) !== backupId || !backupId.startsWith('backup-')) {
    throw new WorkbenchStateError('invalid_backup', 'Invalid backup identity')
  }
  const root = join(resolve(workspacePath), '.unilabos')
  const source = join(root, 'backups', backupId)
  const backup = parseBackup(await readFile(join(source, 'backup.json'), 'utf8'))
  if (backup.schemaVersion > WORKBENCH_STATE_SCHEMA_VERSION) {
    throw new WorkbenchStateError(
      'unsupported_schema',
      `Backup schema ${backup.schemaVersion} is newer than supported ${WORKBENCH_STATE_SCHEMA_VERSION}`
    )
  }
  const safety = await createWorkbenchStateBackup(workspacePath, options)
  try {
    await replacePersistentEntries(root, source)
    await prepareWorkbenchState(workspacePath, options)
    return safety
  } catch (error) {
    await replacePersistentEntries(root, safety.path)
    throw error
  }
}

export async function createWorkbenchDiagnosticBundle(
  workspacePath: string,
  compatibility: Record<string, unknown>,
  options: { maxLogBytes?: number; now?: () => Date } = {}
): Promise<Uint8Array> {
  const root = join(resolve(workspacePath), '.unilabos')
  const maxLogBytes = options.maxLogBytes ?? 64 * 1024
  const now = options.now ?? (() => new Date())
  const manifest = await readWorkbenchStateManifest(root)
  const usage = Object.fromEntries(await Promise.all(STATE_DIRECTORIES.map(
    async directory => [directory, await directorySize(join(root, directory))]
  )))
  const logFiles = (await collectFiles(join(root, 'logs')))
    .filter(file => !file.symbolicLink)
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
    .slice(0, 8)
  const logs = []
  for (const file of logFiles) {
    logs.push({
      path: relativeDiagnosticPath(root, file.path),
      tail: sanitizeDiagnosticText(
        await readTail(file.path, maxLogBytes),
        workspacePath
      )
    })
  }
  const payload = {
    schema: 'unilab-workbench-diagnostics/v1',
    createdAt: now().toISOString(),
    compatibility,
    state: { manifest, usage },
    logs,
    exclusions: ['agent conversations', 'session messages', 'secrets']
  }
  return new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`)
}

export class WorkbenchStateError extends Error {
  constructor(
    readonly code:
      | 'invalid_schema'
      | 'unsupported_schema'
      | 'backup_quota_exceeded'
      | 'invalid_backup',
    message: string
  ) {
    super(message)
    this.name = 'WorkbenchStateError'
  }
}

function newManifest(date: Date): WorkbenchStateManifest {
  const timestamp = date.toISOString()
  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    createdAt: timestamp,
    migratedAt: timestamp
  }
}

function parseManifest(source: string): WorkbenchStateManifest {
  try {
    const value = JSON.parse(source) as Record<string, unknown>
    if (
      !Number.isInteger(value['schemaVersion'])
      || typeof value['createdAt'] !== 'string'
      || typeof value['migratedAt'] !== 'string'
    ) throw new Error('invalid fields')
    return value as unknown as WorkbenchStateManifest
  } catch {
    throw new WorkbenchStateError('invalid_schema', 'Workbench state manifest is corrupt')
  }
}

function parseBackup(source: string): WorkbenchStateBackup {
  try {
    const value = JSON.parse(source) as WorkbenchStateBackup
    if (
      typeof value.id !== 'string'
      || typeof value.path !== 'string'
      || typeof value.createdAt !== 'string'
      || !Number.isInteger(value.schemaVersion)
    ) throw new Error('invalid fields')
    return value
  } catch {
    throw new WorkbenchStateError('invalid_backup', 'Backup manifest is corrupt')
  }
}

async function readWorkbenchStateManifest(
  root: string
): Promise<WorkbenchStateManifest> {
  return parseManifest(await readFile(join(root, 'schema.json'), 'utf8'))
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx'
  })
  await rename(temporary, path)
}

async function replacePersistentEntries(root: string, source: string): Promise<void> {
  for (const entry of PERSISTENT_ENTRIES) {
    const target = join(root, entry)
    await rm(target, { recursive: true, force: true })
    const backupEntry = join(source, entry)
    if (!await pathExists(backupEntry)) continue
    await cp(backupEntry, target, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false
    })
  }
}

async function pruneDirectoryToQuota(
  directory: string,
  quota: number
): Promise<number> {
  const files = (await collectFiles(directory))
    .sort((left, right) => left.modifiedAt - right.modifiedAt)
  let total = files.reduce((bytes, file) => bytes + file.bytes, 0)
  let pruned = 0
  for (const file of files) {
    if (total <= quota) break
    await rm(file.path, { force: true })
    total -= file.bytes
    pruned += file.bytes
  }
  return pruned
}

interface StateFile {
  path: string
  bytes: number
  modifiedAt: number
  symbolicLink: boolean
}

async function collectFiles(directory: string): Promise<StateFile[]> {
  if (!await pathExists(directory)) return []
  const result: StateFile[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await collectFiles(path))
    else {
      const metadata = await lstat(path)
      result.push({
        path,
        bytes: entry.isSymbolicLink() ? 0 : metadata.size,
        modifiedAt: metadata.mtimeMs,
        symbolicLink: entry.isSymbolicLink()
      })
    }
  }
  return result
}

async function entriesSize(
  root: string,
  entries: readonly string[]
): Promise<number> {
  return (await Promise.all(entries.map(entry => directorySize(
    join(root, entry)
  )))).reduce((total, bytes) => total + bytes, 0)
}

async function directorySize(path: string): Promise<number> {
  if (!await pathExists(path)) return 0
  const metadata = await lstat(path)
  if (!metadata.isDirectory()) return metadata.isSymbolicLink() ? 0 : metadata.size
  return (await collectFiles(path)).reduce((total, file) => total + file.bytes, 0)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isFileNotFound(error)) return false
    throw error
  }
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error
    && (error as { code?: string }).code === 'ENOENT'
  )
}

function timestampId(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

async function readTail(path: string, maxBytes: number): Promise<string> {
  const metadata = await stat(path)
  const length = Math.min(metadata.size, maxBytes)
  const descriptor = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    await descriptor.read(buffer, 0, length, metadata.size - length)
    return buffer.toString('utf8')
  } finally {
    await descriptor.close()
  }
}

function sanitizeDiagnosticText(source: string, workspacePath: string): string {
  return source
    .split(resolve(workspacePath)).join('<WORKSPACE>')
    .split(homedir()).join('<HOME>')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s]+/gi, '$1<redacted>')
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi,
      '$1<redacted>')
}

function relativeDiagnosticPath(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : basename(path)
}
