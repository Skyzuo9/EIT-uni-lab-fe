import { spawnSync } from 'node:child_process'
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  MAX_PACKAGED_APP_BYTES,
  resolvePackagingCliPaths
} from './package-windows.mjs'
import {
  prepareRuntimePayloadFromEnvironment,
  validatePackagedRuntimeResources
} from './runtime-payload.mjs'

const MEBIBYTE = 1024 * 1024

export const MIN_LINUX_INSTALLER_BYTES = 10 * MEBIBYTE

const desktopDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDirectory = join(desktopDirectory, 'release')

export function validateLinuxInstaller(
  installerPath,
  minimumBytes = MIN_LINUX_INSTALLER_BYTES
) {
  if (!existsSync(installerPath)) {
    throw new Error(`Linux 安装包不存在：${installerPath}`)
  }
  const size = statSync(installerPath).size
  if (size < minimumBytes) {
    throw new Error(
      `Linux 安装包不完整：${basename(installerPath)} 仅 ${formatMebibytes(size)} MiB`
    )
  }
  const header = Buffer.alloc(4)
  const descriptor = openSync(installerPath, 'r')
  try {
    readSync(descriptor, header, 0, header.length, 0)
  } finally {
    closeSync(descriptor)
  }
  if (!header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error(`Linux AppImage 缺少 ELF 文件头：${installerPath}`)
  }
  return { path: installerPath, size }
}

export function findLinuxInstaller(outputDirectory) {
  const candidates = readdirSync(outputDirectory)
    .filter((name) => name.toLowerCase().endsWith('.appimage'))
    .map((name) => join(outputDirectory, name))
  if (candidates.length !== 1) {
    throw new Error(
      `Linux 安装包数量异常：预期 1 个，实际 ${candidates.length} 个`
    )
  }
  return validateLinuxInstaller(candidates[0])
}

export function validatePackagedLinuxApp(
  outputDirectory,
  maximumBytes = MAX_PACKAGED_APP_BYTES
) {
  const archivePath = join(
    outputDirectory,
    'linux-unpacked',
    'resources',
    'app.asar'
  )
  if (!existsSync(archivePath)) {
    throw new Error(`Linux 应用归档不存在：${archivePath}`)
  }
  const size = statSync(archivePath).size
  if (size > maximumBytes) {
    throw new Error(
      `app.asar 超出 ${formatMebibytes(maximumBytes)} MiB 预算，当前为 ${formatMebibytes(size)} MiB；请检查生产依赖是否被重复打包`
    )
  }
  validatePackagedRuntimeResources(
    join(outputDirectory, 'linux-unpacked', 'resources'),
    'linux-64'
  )
  return { path: archivePath, size }
}

function runCli(entryPath, args, environment = process.env) {
  const result = spawnSync(process.execPath, [entryPath, ...args], {
    cwd: desktopDirectory,
    stdio: 'inherit',
    env: environment
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${basename(entryPath)} 执行失败，退出码 ${result.status}`)
  }
}

export function packageLinux() {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'unilab-linux-package-'))
  const payloadDirectory = mkdtempSync(join(
    desktopDirectory,
    '.runtime-payload-'
  ))
  const { electronViteCli, electronBuilderCli } = resolvePackagingCliPaths()
  try {
    const payload = prepareRuntimePayloadFromEnvironment(
      payloadDirectory,
      'linux-64'
    )
    runCli(electronViteCli, ['build'])
    runCli(electronBuilderCli, [
      '--linux',
      '--publish',
      'never',
      `--config.directories.output=${outputDirectory}`
    ], {
      ...process.env,
      UNILAB_RUNTIME_PAYLOAD_DIR: basename(payload.directory)
    })

    const appArchive = validatePackagedLinuxApp(outputDirectory)
    const installer = findLinuxInstaller(outputDirectory)
    mkdirSync(releaseDirectory, { recursive: true })
    for (const name of readdirSync(outputDirectory).filter((entry) =>
      /(?:\.appimage(?:\.blockmap)?|latest-linux\.yml)$/i.test(entry)
    )) {
      copyFileSync(
        join(outputDirectory, name),
        join(releaseDirectory, name)
      )
    }
    console.log(
      `Linux 安装包已发布：${installer.path}（${formatMebibytes(installer.size)} MiB），app.asar ${formatMebibytes(appArchive.size)} MiB`
    )
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true })
    rmSync(payloadDirectory, { recursive: true, force: true })
  }
}

function formatMebibytes(bytes) {
  return (bytes / MEBIBYTE).toFixed(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    packageLinux()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
