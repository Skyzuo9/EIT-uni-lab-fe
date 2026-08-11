import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'

import * as asar from '@electron/asar'

export const PINNED_AGENT_DISTRIBUTION_VERSION = '2.1.52'
export const EXTERNAL_ONLY_AGENT_CLIS = ['codex', 'claude']

export function resolveAgentTarget(platform, architecture) {
  const key = `${platform}/${architecture}`
  const targets = {
    'darwin/arm64': { directory: 'darwin-arm64', executable: 'aioncore' },
    'darwin/x64': { directory: 'darwin-x64', executable: 'aioncore' },
    'linux/arm64': { directory: 'linux-arm64', executable: 'aioncore' },
    'linux/x64': { directory: 'linux-x64', executable: 'aioncore' },
    'win32/arm64': { directory: 'windows-arm64', executable: 'aioncore.exe' },
    'win32/x64': { directory: 'windows-x64', executable: 'aioncore.exe' }
  }
  const target = targets[key]
  if (!target) throw new Error(`UniLab Agent 不支持目标平台：${key}`)
  return target
}

/** Stage the exact Agent renderer and native core used by the packaged app. */
export function prepareBundledAgentPayload(destination, options = {}) {
  const platform = options.platform ?? process.platform
  const architecture = options.architecture ?? process.arch
  const sourcePath = resolve(
    options.sourcePath
      ?? process.env['UNILAB_AGENT_DISTRIBUTION']
      ?? defaultAgentDistribution(platform)
  )
  const resources = existsSync(join(sourcePath, 'app.asar'))
    ? sourcePath
    : join(sourcePath, 'Contents', 'Resources')
  const archive = join(resources, 'app.asar')
  const target = resolveAgentTarget(platform, architecture)
  const nativeSource = join(resources, 'bundled-aioncore', target.directory)
  const executableSource = join(nativeSource, target.executable)
  const missing = [archive, executableSource].filter(path => !existsSync(path))
  if (missing.length > 0) {
    throw new Error(
      `UniLab Agent 打包源不完整（${sourcePath}）：${missing.join(', ')}`
    )
  }
  const version = readAgentDistributionVersion(archive)
  if (version !== PINNED_AGENT_DISTRIBUTION_VERSION) {
    throw new Error(
      `UniLab Agent 需要 AionUi ${PINNED_AGENT_DISTRIBUTION_VERSION}，实际为 ${version}`
    )
  }

  rmSync(destination, { recursive: true, force: true })
  mkdirSync(join(destination, 'bundled-aioncore'), { recursive: true })
  copyFileSync(archive, join(destination, 'app.asar'))
  cpSync(
    nativeSource,
    join(destination, 'bundled-aioncore', target.directory),
    {
      recursive: true,
      preserveTimestamps: true,
      // macOS code signing rejects package-internal symlinks containing `..`.
      // The pinned Node npm/npx/corepack launchers are the only such links.
      dereference: true
    }
  )
  materializePackageSymlinks(
    nativeSource,
    join(destination, 'bundled-aioncore', target.directory)
  )
  const managedResources = join(
    destination,
    'bundled-aioncore',
    target.directory,
    'managed-resources'
  )
  // Agent CLIs are intentionally never redistributed by UniLab Workbench.
  // Aioncore and its UI remain bundled, while a user-installed CLI may be
  // selected from the host environment at runtime.
  for (const cli of EXTERNAL_ONLY_AGENT_CLIS) {
    rmSync(join(managedResources, 'cli', cli), {
      recursive: true,
      force: true
    })
  }
  rewriteManagedResourcesManifest(managedResources)
  clearMacosDownloadQuarantine(destination, platform)
  writeFileSync(join(destination, 'payload.json'), `${JSON.stringify({
    schemaVersion: 1,
    implementation: 'aioncore',
    sourceProduct: 'AionUi',
    version,
    platform,
    architecture,
    targetDirectory: target.directory,
    executable: target.executable,
    bundledClis: [],
    externalClis: EXTERNAL_ONLY_AGENT_CLIS
  }, null, 2)}\n`)
  return {
    destination,
    version,
    sourceExecutable: executableSource,
    archive: join(destination, 'app.asar'),
    executable: join(
      destination,
      'bundled-aioncore',
      target.directory,
      target.executable
    )
  }
}

function clearMacosDownloadQuarantine(destination, platform) {
  if (platform !== 'darwin') return
  for (const attribute of [
    'com.apple.quarantine',
    'com.apple.provenance'
  ]) {
    spawnSync('xattr', ['-dr', attribute, destination], {
      stdio: 'ignore'
    })
  }
}

function materializePackageSymlinks(sourceDirectory, destinationDirectory) {
  for (const name of readdirSync(sourceDirectory)) {
    const source = join(sourceDirectory, name)
    const destination = join(destinationDirectory, name)
    const sourceStat = lstatSync(source)
    if (sourceStat.isSymbolicLink()) {
      unlinkSync(destination)
      cpSync(realpathSync(source), destination, {
        recursive: true,
        preserveTimestamps: true,
        dereference: true
      })
    } else if (sourceStat.isDirectory()) {
      materializePackageSymlinks(source, destination)
    }
  }
}

export function validateBundledAgentPayload(
  resources,
  platform = process.platform,
  architecture = process.arch
) {
  const target = resolveAgentTarget(platform, architecture)
  const root = join(resources, 'agent-runtime')
  const archive = join(root, 'app.asar')
  const executable = join(
    root,
    'bundled-aioncore',
    target.directory,
    target.executable
  )
  const missing = [archive, executable, join(root, 'payload.json')]
    .filter(path => !existsSync(path))
  if (missing.length > 0) {
    throw new Error(`Workbench 安装包缺少 Agent 运行资源：${missing.join(', ')}`)
  }
  const version = readAgentDistributionVersion(archive)
  if (version !== PINNED_AGENT_DISTRIBUTION_VERSION) {
    throw new Error(`Workbench Agent 版本错误：${version}`)
  }
  for (const cli of EXTERNAL_ONLY_AGENT_CLIS) {
    const forbiddenPath = join(
      root,
      'bundled-aioncore',
      target.directory,
      'managed-resources',
      'cli',
      cli
    )
    if (existsSync(forbiddenPath)) {
      throw new Error(`Workbench 安装包不得内置 ${cli}：${forbiddenPath}`)
    }
  }
  return { root, archive, executable, version }
}

function rewriteManagedResourcesManifest(managedResources) {
  const manifestPath = join(managedResources, 'manifest.json')
  if (!existsSync(manifestPath)) return
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.clis = []
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function readAgentDistributionVersion(archive) {
  let manifest
  try {
    manifest = JSON.parse(
      asar.extractFile(archive, 'package.json').toString('utf8')
    )
  } catch (error) {
    throw new Error(`Agent app.asar 清单无效：${basename(archive)}`, {
      cause: error
    })
  }
  if (!manifest || typeof manifest.version !== 'string') {
    throw new Error('Agent app.asar 缺少版本号')
  }
  return manifest.version.trim()
}

function defaultAgentDistribution(platform) {
  if (platform === 'darwin') return '/Applications/AionUi.app'
  throw new Error(
    '请用 UNILAB_AGENT_DISTRIBUTION 指定目标平台 AionUi 2.1.52 分发目录'
  )
}
