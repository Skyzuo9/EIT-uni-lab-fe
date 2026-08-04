import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { constants as fsConstants, createReadStream } from 'node:fs'
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import type { LocalRuntimeModeInfo } from '../shared/localRuntime'

const MANIFEST_SCHEMA_VERSION = 1
const INSTALL_LOCK_TIMEOUT_MS = 10 * 60 * 1_000
const INSTALL_LOCK_STALE_MS = 2 * 60 * 60 * 1_000
const INSTALL_LOCK_POLL_MS = 50

export interface ManagedRuntimeManifest {
  schemaVersion: 1
  runtimeVersion: string
  platform: 'linux-64' | 'osx-64' | 'osx-arm64' | 'win-64'
  installerFile: string
  sha256: string
}

export interface ManagedRuntimePaths {
  prefix: string
  runtimeVersion: string
  platform: ManagedRuntimeManifest['platform']
  pythonExecutable: string
  unilabExecutable: string
  supervisorExecutable: string
  manifestSha256: string
}

export type RuntimeInstallerRunner = (
  installerPath: string,
  prefix: string
) => Promise<void>

interface ManagedRuntimeInstallationOptions {
  resourcesDirectory: string
  dataDirectory: string
  platform?: NodeJS.Platform
  architecture?: string
  runInstaller?: RuntimeInstallerRunner
}

/**
 * 校验随桌面端分发的 Constructor 载荷，并把私有 Runtime 原子安装到用户目录。
 * 调用方只需要 `ensureInstalled`；平台参数、校验和修复细节全部留在模块内。
 */
export class ManagedRuntimeInstallation {
  private readonly resourcesDirectory: string
  private readonly dataDirectory: string
  private readonly platform: NodeJS.Platform
  private readonly architecture: string
  private readonly runInstaller: RuntimeInstallerRunner
  private pending: Promise<ManagedRuntimePaths> | null = null

  constructor(options: ManagedRuntimeInstallationOptions) {
    this.resourcesDirectory = resolve(options.resourcesDirectory)
    this.dataDirectory = resolve(options.dataDirectory)
    this.platform = options.platform ?? process.platform
    this.architecture = options.architecture ?? process.arch
    this.runInstaller = options.runInstaller ?? runConstructorInstaller(
      this.platform
    )
  }

  ensureInstalled(): Promise<ManagedRuntimePaths> {
    this.pending ??= this.install()
    return this.pending.catch((error: unknown) => {
      this.pending = null
      throw error
    })
  }

  async getModeInfo(): Promise<LocalRuntimeModeInfo> {
    const manifest = await this.readManifest()
    const workspacePath = join(this.resourcesDirectory, 'default-workspace')
    const graphPath = join(
      workspacePath,
      'deployment',
      'graphs',
      'device.json'
    )
    await Promise.all([
      access(join(workspacePath, 'package.yaml'), fsConstants.R_OK),
      access(
        join(workspacePath, 'deployment', 'local_config.py'),
        fsConstants.R_OK
      ),
      access(graphPath, fsConstants.R_OK)
    ])
    return {
      mode: 'managed',
      label: '内置 Runtime',
      runtimeVersion: manifest.runtimeVersion,
      defaultLaunchConfig: {
        graphPath,
        osProjectPath: '',
        szlabProjectPath: workspacePath,
        environmentPath: '',
        simulatorProjectPath: ''
      }
    }
  }

  private async install(): Promise<ManagedRuntimePaths> {
    const payloadDirectory = join(
      this.resourcesDirectory,
      'runtime-installer'
    )
    const manifest = await this.readManifest()
    if (basename(manifest.installerFile) !== manifest.installerFile) {
      throw new Error('Runtime installerFile 必须是文件名，不能包含路径')
    }
    const installerPath = join(payloadDirectory, manifest.installerFile)
    const actualSha256 = await sha256File(installerPath)
    if (actualSha256 !== manifest.sha256) {
      throw new Error(
        `Runtime 安装器校验失败：期望 ${manifest.sha256}，实际 ${actualSha256}`
      )
    }

    const versionsDirectory = join(
      this.dataDirectory,
      'managed-runtime',
      'versions'
    )
    const versionName = [
      manifest.runtimeVersion,
      manifest.platform,
      manifest.sha256.slice(0, 16)
    ].join('-')
    const prefix = join(versionsDirectory, versionName)
    const result = runtimePaths(prefix, manifest)
    const runtimeRoot = join(this.dataDirectory, 'managed-runtime')
    await mkdir(versionsDirectory, { recursive: true })
    const releaseLock = await acquireInstallLock(
      join(runtimeRoot, 'install.lock')
    )
    try {
      if (await validInstallation(result, this.platform)) {
        await this.writeActive(result)
        return result
      }

      const stagingPrefix = join(
        versionsDirectory,
        `.${versionName}.installing-${process.pid}-${Date.now()}`
      )
      await rm(stagingPrefix, { recursive: true, force: true })
      try {
        await this.runInstaller(installerPath, stagingPrefix)
        const stagingResult = runtimePaths(stagingPrefix, manifest)
        if (!await validInstallation(stagingResult, this.platform)) {
          throw new Error('Constructor 完成后缺少 python、unilab 或 unilab-supervisor')
        }

        if (await pathExists(prefix)) {
          await rename(
            prefix,
            `${prefix}.broken-${Date.now()}`
          )
        }
        await rename(stagingPrefix, prefix)
        await this.writeActive(result)
        return result
      } catch (error) {
        await rm(stagingPrefix, { recursive: true, force: true })
        throw error
      }
    } finally {
      await releaseLock()
    }
  }

  private async readManifest(): Promise<ManagedRuntimeManifest> {
    const manifestPath = join(
      this.resourcesDirectory,
      'runtime-installer',
      'manifest.json'
    )
    const manifest = parseManifest(await readFile(manifestPath, 'utf8'))
    const expectedPlatform = constructorPlatform(
      this.platform,
      this.architecture
    )
    if (manifest.platform !== expectedPlatform) {
      throw new Error(
        `Runtime 载荷平台不匹配：当前 ${expectedPlatform}，载荷 ${manifest.platform}`
      )
    }
    return manifest
  }

  private async writeActive(result: ManagedRuntimePaths): Promise<void> {
    const root = join(this.dataDirectory, 'managed-runtime')
    const target = join(root, 'active.json')
    const temporary = join(root, `.active-${process.pid}.tmp`)
    await mkdir(root, { recursive: true })
    await writeFile(temporary, `${JSON.stringify({
      schemaVersion: 1,
      ...result
    }, null, 2)}\n`, 'utf8')
    await replaceFile(temporary, target, this.platform)
  }
}

function parseManifest(raw: string): ManagedRuntimeManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error('Runtime manifest 不是有效 JSON', { cause: error })
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Runtime manifest 必须是 JSON object')
  }
  const candidate = parsed as Record<string, unknown>
  if (candidate.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error('Runtime manifest schemaVersion 不受支持')
  }
  if (
    typeof candidate.runtimeVersion !== 'string'
    || !candidate.runtimeVersion.trim()
    || typeof candidate.installerFile !== 'string'
    || !candidate.installerFile.trim()
    || typeof candidate.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(candidate.sha256)
    || ![
      'linux-64',
      'osx-64',
      'osx-arm64',
      'win-64'
    ].includes(String(candidate.platform))
  ) {
    throw new Error('Runtime manifest 字段无效')
  }
  return candidate as unknown as ManagedRuntimeManifest
}

function constructorPlatform(
  platform: NodeJS.Platform,
  architecture: string
): ManagedRuntimeManifest['platform'] {
  if (platform === 'win32' && architecture === 'x64') return 'win-64'
  if (platform === 'linux' && architecture === 'x64') return 'linux-64'
  if (platform === 'darwin' && architecture === 'x64') return 'osx-64'
  if (platform === 'darwin' && architecture === 'arm64') return 'osx-arm64'
  throw new Error(`不支持的 Runtime 平台：${platform}/${architecture}`)
}

function runtimePaths(
  prefix: string,
  manifest: ManagedRuntimeManifest
): ManagedRuntimePaths {
  const windows = manifest.platform === 'win-64'
  return {
    prefix,
    runtimeVersion: manifest.runtimeVersion,
    platform: manifest.platform,
    pythonExecutable: windows
      ? join(prefix, 'python.exe')
      : join(prefix, 'bin', 'python'),
    unilabExecutable: windows
      ? join(prefix, 'Scripts', 'unilab.exe')
      : join(prefix, 'bin', 'unilab'),
    supervisorExecutable: windows
      ? join(prefix, 'Scripts', 'unilab-supervisor.exe')
      : join(prefix, 'bin', 'unilab-supervisor'),
    manifestSha256: manifest.sha256
  }
}

async function validInstallation(
  paths: ManagedRuntimePaths,
  platform: NodeJS.Platform
): Promise<boolean> {
  const mode = platform === 'win32'
    ? fsConstants.R_OK
    : fsConstants.R_OK | fsConstants.X_OK
  try {
    await Promise.all([
      access(paths.pythonExecutable, mode),
      access(paths.unilabExecutable, mode),
      access(paths.supervisorExecutable, mode)
    ])
    return true
  } catch {
    return false
  }
}

function runConstructorInstaller(
  platform: NodeJS.Platform
): RuntimeInstallerRunner {
  return async (installerPath, prefix) => {
    const command = platform === 'win32' ? installerPath : 'bash'
    const args = platform === 'win32'
      ? [
          '/S',
          '/InstallationType=JustMe',
          '/NoRegistry=1',
          '/NoShortcuts=1',
          '/RegisterPython=0',
          `/D=${prefix}`
        ]
      : [installerPath, '-b', '-p', prefix]
    await run(command, args)
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: 'ignore',
      windowsHide: true
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(
        `Runtime 安装器执行失败：code=${String(code)} signal=${String(signal)}`
      ))
    })
  })
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.once('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('end', () => resolvePromise(hash.digest('hex')))
  })
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function acquireInstallLock(path: string): Promise<() => Promise<void>> {
  const startedAt = Date.now()
  while (true) {
    try {
      const handle = await open(path, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify({
        pid: process.pid,
        startedAt: Date.now()
      })}\n`, 'utf8')
      return async () => {
        await handle.close()
        await rm(path, { force: true })
      }
    } catch (error) {
      if (!isFileExistsError(error)) throw error
      if (await installLockIsStale(path)) {
        await rm(path, { force: true })
        continue
      }
      if (Date.now() - startedAt >= INSTALL_LOCK_TIMEOUT_MS) {
        throw new Error('等待其他桌面进程安装 Runtime 超时')
      }
      await delay(INSTALL_LOCK_POLL_MS)
    }
  }
}

async function installLockIsStale(path: string): Promise<boolean> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as { startedAt?: unknown }
    if (typeof parsed.startedAt === 'number') {
      return Date.now() - parsed.startedAt >= INSTALL_LOCK_STALE_MS
    }
  } catch {
    // 写入中或旧格式锁：退回文件时间判断，避免误删活跃锁。
  }
  try {
    const metadata = await stat(path)
    return Date.now() - metadata.mtimeMs >= INSTALL_LOCK_STALE_MS
  } catch {
    return false
  }
}

async function replaceFile(
  source: string,
  target: string,
  platform: NodeJS.Platform
): Promise<void> {
  if (platform !== 'win32' || !await pathExists(target)) {
    await rename(source, target)
    return
  }

  const backup = `${target}.previous-${process.pid}-${Date.now()}`
  await rename(target, backup)
  try {
    await rename(source, target)
    await rm(backup, { force: true })
  } catch (error) {
    if (!await pathExists(target) && await pathExists(backup)) {
      await rename(backup, target)
    }
    throw error
  }
}

function isFileExistsError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'EEXIST'
  )
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds)
  })
}
