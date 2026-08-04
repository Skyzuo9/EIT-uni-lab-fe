import { createHash } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, join, resolve } from 'node:path'

const SUPPORTED_PLATFORMS = new Set([
  'linux-64',
  'osx-64',
  'osx-arm64',
  'win-64'
])

export function prepareRuntimePayload({
  installerPath,
  runtimeVersion,
  platform,
  destinationDirectory
}) {
  const source = resolveRequiredFile(installerPath)
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`不支持的 Runtime 平台：${platform}`)
  }
  if (typeof runtimeVersion !== 'string' || !runtimeVersion.trim()) {
    throw new Error('UNILAB_RUNTIME_VERSION 不能为空')
  }
  const installerFile = basename(source)
  const expectedExtension = platform === 'win-64' ? '.exe' : '.sh'
  if (!installerFile.toLowerCase().endsWith(expectedExtension)) {
    throw new Error(
      `${platform} Runtime 安装器必须使用 ${expectedExtension} 扩展名`
    )
  }

  const destination = resolve(destinationDirectory)
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  const copiedInstaller = join(destination, installerFile)
  copyFileSync(source, copiedInstaller)
  const manifestPath = join(destination, 'manifest.json')
  writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    runtimeVersion: runtimeVersion.trim(),
    platform,
    installerFile,
    sha256: sha256File(copiedInstaller)
  }, null, 2)}\n`, 'utf8')
  return { installerPath: copiedInstaller, manifestPath, directory: destination }
}

export function prepareRuntimePayloadFromEnvironment(
  destinationDirectory,
  expectedPlatform,
  environment = process.env
) {
  const configuredPlatform = environment.UNILAB_RUNTIME_PLATFORM
    ?? expectedPlatform
  if (configuredPlatform !== expectedPlatform) {
    throw new Error(
      `Runtime 平台不匹配：打包目标 ${expectedPlatform}，载荷 ${configuredPlatform}`
    )
  }
  return prepareRuntimePayload({
    installerPath: environment.UNILAB_RUNTIME_INSTALLER,
    runtimeVersion: environment.UNILAB_RUNTIME_VERSION,
    platform: configuredPlatform,
    destinationDirectory
  })
}

export function validatePackagedRuntimeResources(
  resourcesDirectory,
  expectedPlatform
) {
  const runtimeDirectory = join(resourcesDirectory, 'runtime-installer')
  const manifestPath = join(runtimeDirectory, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`Runtime manifest 未打入桌面应用：${manifestPath}`)
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error('桌面应用中的 Runtime manifest 无效', { cause: error })
  }
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || manifest.platform !== expectedPlatform
    || typeof manifest.installerFile !== 'string'
    || basename(manifest.installerFile) !== manifest.installerFile
    || typeof manifest.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(manifest.sha256)
  ) {
    throw new Error('桌面应用中的 Runtime manifest 字段无效')
  }
  const installerPath = join(runtimeDirectory, manifest.installerFile)
  if (!existsSync(installerPath) || !statSync(installerPath).isFile()) {
    throw new Error(`Runtime Constructor 未打入桌面应用：${installerPath}`)
  }
  const actualHash = sha256File(installerPath)
  if (actualHash !== manifest.sha256) {
    throw new Error(
      `桌面应用中的 Runtime Constructor 校验失败：${actualHash}`
    )
  }

  const workspace = join(resourcesDirectory, 'default-workspace')
  for (const relativePath of [
    'package.yaml',
    'deployment/local_config.py',
    'deployment/graphs/device.json',
    'unilab.acceptance.json'
  ]) {
    const path = join(workspace, relativePath)
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`默认工作区文件未打入桌面应用：${path}`)
    }
  }
  return { manifestPath, installerPath, workspace }
}

function resolveRequiredFile(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('UNILAB_RUNTIME_INSTALLER 不能为空')
  }
  const path = resolve(value)
  if (!existsSync(path)) throw new Error(`Runtime 安装器不存在：${path}`)
  return path
}

function sha256File(path) {
  const hash = createHash('sha256')
  const descriptor = openSync(path, 'r')
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024)
  try {
    while (true) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null)
      if (bytesRead === 0) break
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    closeSync(descriptor)
  }
  return hash.digest('hex')
}
