import {
  createHash,
  createPublicKey,
  verify as verifySignature
} from 'node:crypto'
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

import type { DevicePackageTrustInfo } from '../shared/localRuntime'

const SIGNATURE_FILE = 'unilab.package-signature.json'
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.pytest_cache',
  '.venv',
  '__pycache__',
  'node_modules',
  'runtime'
])

interface TrustDecision {
  contentHash: string
  workspacePath: string
  confirmedAt: number
  signatureStatus: DevicePackageTrustInfo['signatureStatus']
}

interface TrustState {
  schemaVersion: 1
  decisions: TrustDecision[]
}

/** 内容寻址的设备包首次使用决策。签名无效只警告，最终是否运行由用户决定。 */
export class DevicePackageTrustStore {
  private pending: Promise<void> = Promise.resolve()

  constructor(private readonly stateDirectory: string) {}

  async inspect(workspacePath: string): Promise<DevicePackageTrustInfo> {
    const workspace = resolve(workspacePath)
    const workspaceStat = await stat(workspace)
    if (!workspaceStat.isDirectory()) throw new Error('设备包路径不是目录')
    const contentHash = await hashWorkspace(workspace)
    const signature = await inspectSignature(workspace, contentHash)
    const state = await this.readState()
    const trusted = state.decisions.some(
      (decision) => decision.contentHash === contentHash
    )
    return {
      workspacePath: workspace,
      contentHash,
      signatureStatus: signature.status,
      signerFingerprint: signature.signerFingerprint,
      trusted,
      confirmationRequired: !trusted
    }
  }

  async confirm(
    workspacePath: string,
    expectedContentHash: string
  ): Promise<DevicePackageTrustInfo> {
    const inspection = await this.inspect(workspacePath)
    if (inspection.contentHash !== expectedContentHash) {
      throw new Error('设备包内容在确认前发生变化，请重新检查')
    }
    await this.serialize(async () => {
      const state = await this.readState()
      const withoutCurrent = state.decisions.filter(
        (decision) => decision.contentHash !== inspection.contentHash
      )
      const decision: TrustDecision = {
        contentHash: inspection.contentHash,
        workspacePath: inspection.workspacePath,
        confirmedAt: Date.now(),
        signatureStatus: inspection.signatureStatus
      }
      await this.writeState({
        schemaVersion: 1,
        decisions: [...withoutCurrent, decision]
      })
      await appendFile(
        join(this.stateDirectory, 'audit.jsonl'),
        `${JSON.stringify({
          schemaVersion: 1,
          event: 'device_package_first_use_confirmed',
          ...decision
        })}\n`,
        'utf8'
      )
    })
    return {
      ...inspection,
      trusted: true,
      confirmationRequired: false
    }
  }

  private async readState(): Promise<TrustState> {
    try {
      const parsed = JSON.parse(await readFile(
        join(this.stateDirectory, 'decisions.json'),
        'utf8'
      )) as unknown
      if (!isRecord(parsed) || !Array.isArray(parsed['decisions'])) {
        throw new Error('设备包信任状态文件损坏')
      }
      return parsed as unknown as TrustState
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { schemaVersion: 1, decisions: [] }
      }
      throw error
    }
  }

  private async writeState(state: TrustState): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true })
    const target = join(this.stateDirectory, 'decisions.json')
    const temporary = join(
      this.stateDirectory,
      `.decisions-${process.pid}-${Date.now()}.tmp`
    )
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    if (process.platform === 'win32') await rm(target, { force: true })
    await rename(temporary, target)
  }

  private async serialize(operation: () => Promise<void>): Promise<void> {
    const next = this.pending.then(operation, operation)
    this.pending = next.catch(() => undefined)
    return next
  }
}

async function hashWorkspace(workspace: string): Promise<string> {
  const files = await listPackageFiles(workspace, workspace)
  const hash = createHash('sha256')
  for (const path of files.sort()) {
    const relativePath = relative(workspace, path).split(sep).join('/')
    hash.update(relativePath)
    hash.update('\0')
    hash.update(await readFile(path))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function listPackageFiles(
  root: string,
  directory: string
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (entry.name === SIGNATURE_FILE) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...await listPackageFiles(root, path))
      }
    } else if (entry.isFile()) {
      files.push(path)
    }
  }
  return files
}

async function inspectSignature(
  workspace: string,
  contentHash: string
): Promise<{
  status: DevicePackageTrustInfo['signatureStatus']
  signerFingerprint: string | null
}> {
  let raw: string
  try {
    raw = await readFile(join(workspace, SIGNATURE_FILE), 'utf8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { status: 'unsigned', signerFingerprint: null }
    }
    throw error
  }
  try {
    const value = JSON.parse(raw) as unknown
    if (
      !isRecord(value)
      || value['schemaVersion'] !== 1
      || value['algorithm'] !== 'ed25519'
      || typeof value['publicKey'] !== 'string'
      || typeof value['signature'] !== 'string'
    ) {
      return { status: 'invalid', signerFingerprint: null }
    }
    const publicKey = createPublicKey(value['publicKey'])
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' })
    const signerFingerprint = createHash('sha256')
      .update(publicKeyDer)
      .digest('hex')
    const valid = verifySignature(
      null,
      Buffer.from(contentHash, 'hex'),
      publicKey,
      Buffer.from(value['signature'], 'base64')
    )
    return {
      status: valid ? 'valid' : 'invalid',
      signerFingerprint
    }
  } catch {
    return { status: 'invalid', signerFingerprint: null }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
