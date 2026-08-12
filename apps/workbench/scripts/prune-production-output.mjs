import { readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MEBIBYTE = 1024 * 1024

export const MAX_PRODUCTION_LIB_BYTES = 90 * MEBIBYTE

export async function pruneSourceMaps(directory) {
  let removedBytes = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      removedBytes += await pruneSourceMaps(path)
    } else if (entry.isFile() && entry.name.endsWith('.map')) {
      removedBytes += (await stat(path)).size
      await rm(path)
    }
  }
  return removedBytes
}

export async function directorySize(directory) {
  let bytes = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) bytes += await directorySize(path)
    else if (entry.isFile()) bytes += (await stat(path)).size
  }
  return bytes
}

export async function prepareProductionOutput(
  directory,
  maximumBytes = MAX_PRODUCTION_LIB_BYTES
) {
  const removedBytes = await pruneSourceMaps(directory)
  const packagedBytes = await directorySize(directory)
  if (packagedBytes > maximumBytes) {
    const maximum = formatMebibytes(maximumBytes)
    const actual = formatMebibytes(packagedBytes)
    throw new Error(
      `Workbench production lib 超出 ${maximum} MiB 预算，当前为 ${actual} MiB`
    )
  }
  return { removedBytes, packagedBytes }
}

export async function prepareWorkbenchProductionOutput(workbenchDirectory) {
  const lib = await prepareProductionOutput(join(workbenchDirectory, 'lib'))
  const pluginsDirectory = join(workbenchDirectory, 'plugins')
  const pluginMapsRemovedBytes = await pruneSourceMaps(pluginsDirectory)
  const pluginBytes = await directorySize(pluginsDirectory)
  return { lib, pluginMapsRemovedBytes, pluginBytes }
}

function formatMebibytes(bytes) {
  return (bytes / MEBIBYTE).toFixed(1)
}

const isDirectRun = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const workbenchDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
  const result = await prepareWorkbenchProductionOutput(workbenchDirectory)
  const packaged = formatMebibytes(result.lib.packagedBytes)
  const removed = formatMebibytes(result.lib.removedBytes)
  const plugins = formatMebibytes(result.pluginBytes)
  const pluginMaps = formatMebibytes(result.pluginMapsRemovedBytes)
  console.log(
    `Workbench production lib ${packaged} MiB（移除 source map ${removed} MiB），插件 ${plugins} MiB（移除 source map ${pluginMaps} MiB）`
  )
}
