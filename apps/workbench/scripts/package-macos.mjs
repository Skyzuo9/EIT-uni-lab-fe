import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MEBIBYTE = 1024 * 1024
const MIN_INSTALLER_BYTES = 50 * MEBIBYTE
export const NODE_RUNTIME_VERSION = '24.14.0'
export const NODE_RUNTIME_SHA256 =
  'a1a54f46a750d2523d628d924aab61758a51c9dad3e0238beb14141be9615dd3'
const REQUIRED_SIGNING_ENVIRONMENT = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID'
]

const workbenchDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryDirectory = resolve(workbenchDirectory, '../..')
const releaseDirectory = join(workbenchDirectory, 'release-macos')
const packagingDirectory = join(workbenchDirectory, '.packaging')
const desktopRuntimeDirectory = join(packagingDirectory, 'desktop-runtime')
const nodeRuntimeDirectory = join(packagingDirectory, 'node-runtime')

export function assertMacosSigningEnvironment(environment = process.env) {
  const missing = REQUIRED_SIGNING_ENVIRONMENT.filter(
    name => !environment[name]?.trim()
  )
  if (missing.length > 0) {
    throw new Error(
      `签名/公证凭据不完整，缺少：${missing.join(', ')}。正式 package:mac 不会降级为 unsigned。`
    )
  }
}

export function validateMacosInstaller(installerPath) {
  if (!existsSync(installerPath)) {
    throw new Error(`macOS 安装包不存在：${installerPath}`)
  }
  const size = statSync(installerPath).size
  if (size < MIN_INSTALLER_BYTES) {
    throw new Error(
      `macOS 安装包不完整：${basename(installerPath)} 仅 ${formatMebibytes(size)} MiB`
    )
  }
  const signature = Buffer.alloc(4)
  const descriptor = openSync(installerPath, 'r')
  try {
    readSync(descriptor, signature, 0, signature.length, size - 512)
  } finally {
    closeSync(descriptor)
  }
  if (signature.toString('ascii') !== 'koly') {
    throw new Error(`macOS 安装包缺少有效 UDIF 尾部：${installerPath}`)
  }
  return { path: installerPath, size }
}

export function validatePackagedWorkbench(outputDirectory) {
  const appPath = findPackagedApplication(outputDirectory)
  const resources = join(appPath, 'Contents', 'Resources')
  const required = [
    join(resources, 'app.asar'),
    join(resources, 'workbench', 'lib', 'backend', 'main.js'),
    join(resources, 'workbench', 'package.json'),
    join(resources, 'workbench', 'lib', 'frontend', 'index.html'),
    join(resources, 'workbench', 'lib', 'backend', 'native', 'watcher.node'),
    join(resources, 'workbench', 'lib', 'prebuilds', 'darwin-arm64', 'pty.node'),
    join(resources, 'workbench', 'plugins'),
    join(resources, 'node-runtime', 'bin', 'node'),
    join(resources, 'desktop', 'out', 'main', 'index.js'),
    join(resources, 'desktop', 'out', 'preload', 'index.js'),
    join(resources, 'desktop', 'node_modules', '@unilab', 'device-card-host'),
    join(resources, 'desktop', 'node_modules', '@arizeai', 'phoenix-otel'),
    join(resources, 'device-card-builder', 'esbuild'),
    join(resources, 'device-card-agent', 'cli.mjs'),
    join(resources, 'compatibility.json')
  ]
  const missing = required.filter(entry => !existsSync(entry))
  if (missing.length > 0) {
    throw new Error(`Workbench 安装包缺少运行资源：${missing.join(', ')}`)
  }
  return appPath
}

export function packageMacos({ signed }) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('T11 仅在 macOS arm64 构建；darwin-x64 仍为 unverified。')
  }
  if (signed) assertMacosSigningEnvironment()

  const outputDirectory = mkdtempSync(join(tmpdir(), 'unilab-workbench-macos-'))
  rmSync(packagingDirectory, { recursive: true, force: true })
  mkdirSync(packagingDirectory, { recursive: true })
  try {
    copyFileSync(
      join(workbenchDirectory, 'package.json'),
      join(packagingDirectory, 'workbench-package.json')
    )
    preparePinnedNodeRuntime()
    runCommand('pnpm', [
      '--filter',
      '@unilab/desktop',
      'deploy',
      '--prod',
      '--legacy',
      '--offline',
      desktopRuntimeDirectory
    ], repositoryDirectory)

    const builderArgs = [
      '--mac',
      'dmg',
      '--arm64',
      '--publish',
      'never',
      `--config.directories.output=${outputDirectory}`
    ]
    const builderEnvironment = { ...process.env }
    if (!signed) {
      builderEnvironment['CSC_IDENTITY_AUTO_DISCOVERY'] = 'false'
      builderArgs.push(
        '--config.mac.identity=null',
        '--config.mac.notarize=false'
      )
    }
    runCommand(
      process.execPath,
      [
        join(
          workbenchDirectory,
          'node_modules',
          'electron-builder',
          'out',
          'cli',
          'cli.js'
        ),
        ...builderArgs
      ],
      workbenchDirectory,
      builderEnvironment
    )

    const appPath = validatePackagedWorkbench(outputDirectory)
    runCommand(process.execPath, [
      fileURLToPath(new URL('./verify-packaged-backend.mjs', import.meta.url)),
      '--app',
      appPath
    ])
    const installer = findInstaller(outputDirectory)
    if (signed) verifySignedAndNotarized(appPath, installer.path)
    publishInstaller(installer.path)
    console.log(
      `macOS ${signed ? 'signed/notarized' : 'unsigned'} 安装包已发布：${join(releaseDirectory, basename(installer.path))}（${formatMebibytes(installer.size)} MiB）`
    )
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true })
    rmSync(packagingDirectory, { recursive: true, force: true })
  }
}

function preparePinnedNodeRuntime() {
  const archiveName = `node-v${NODE_RUNTIME_VERSION}-darwin-arm64.tar.gz`
  const cacheDirectory = join(
    homedir(),
    'Library',
    'Caches',
    'UniLab Workbench',
    'downloads'
  )
  const archivePath = join(cacheDirectory, archiveName)
  mkdirSync(cacheDirectory, { recursive: true })
  if (!hasExpectedSha256(archivePath, NODE_RUNTIME_SHA256)) {
    rmSync(archivePath, { force: true })
    runCommand('curl', [
      '-fL',
      '--retry',
      '3',
      `https://nodejs.org/dist/v${NODE_RUNTIME_VERSION}/${archiveName}`,
      '-o',
      archivePath
    ])
  }
  if (!hasExpectedSha256(archivePath, NODE_RUNTIME_SHA256)) {
    throw new Error(`Node ${NODE_RUNTIME_VERSION} runtime SHA-256 校验失败。`)
  }

  const binaryDirectory = join(nodeRuntimeDirectory, 'bin')
  mkdirSync(binaryDirectory, { recursive: true })
  runCommand('tar', [
    '-xzf',
    archivePath,
    '-C',
    binaryDirectory,
    '--strip-components=2',
    `node-v${NODE_RUNTIME_VERSION}-darwin-arm64/bin/node`
  ])
  const binaryPath = join(binaryDirectory, 'node')
  const version = spawnSync(binaryPath, ['--version'], { encoding: 'utf8' })
  if (version.status !== 0 || version.stdout.trim() !== `v${NODE_RUNTIME_VERSION}`) {
    throw new Error(`Node backend runtime 不可执行：${binaryPath}`)
  }
}

function hasExpectedSha256(filePath, expected) {
  if (!existsSync(filePath)) return false
  const actual = createHash('sha256').update(readFileSync(filePath)).digest('hex')
  return actual === expected
}

function findPackagedApplication(outputDirectory) {
  for (const directory of readdirSync(outputDirectory, { withFileTypes: true })) {
    if (!directory.isDirectory() || !directory.name.startsWith('mac')) continue
    const app = readdirSync(join(outputDirectory, directory.name), {
      withFileTypes: true
    }).find(entry => entry.isDirectory() && entry.name.endsWith('.app'))
    if (app) return join(outputDirectory, directory.name, app.name)
  }
  throw new Error(`macOS .app 不存在：${outputDirectory}`)
}

function findInstaller(outputDirectory) {
  const installers = readdirSync(outputDirectory)
    .filter(name => name.endsWith('.dmg'))
    .map(name => join(outputDirectory, name))
  if (installers.length !== 1) {
    throw new Error(`预期 1 个 DMG，实际 ${installers.length} 个。`)
  }
  return validateMacosInstaller(installers[0])
}

function publishInstaller(installerPath) {
  mkdirSync(releaseDirectory, { recursive: true })
  copyFileSync(installerPath, join(releaseDirectory, basename(installerPath)))
}

function verifySignedAndNotarized(appPath, installerPath) {
  runCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
  runCommand('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath])
  runCommand('xcrun', ['stapler', 'validate', appPath])
  runCommand('xcrun', ['stapler', 'validate', installerPath])
}

function runCommand(command, args, cwd = workbenchDirectory, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${basename(command)} 执行失败，退出码 ${result.status}`)
  }
}

function formatMebibytes(bytes) {
  return (bytes / MEBIBYTE).toFixed(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  if (!['--signed', '--unsigned'].includes(mode)) {
    console.error('用法：package-macos.mjs --signed|--unsigned')
    process.exitCode = 1
  } else {
    try {
      packageMacos({ signed: mode === '--signed' })
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    }
  }
}
