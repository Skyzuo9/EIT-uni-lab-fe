import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { ElectronObservability } from './observability'
import { stopLocalRuntimeProcessTree } from './localRuntimeProcess'

declare global {
  // The packaged Workbench launcher owns the Theia backend, while the shared
  // Electron main owns the application quit contract. The explicit hand-off
  // keeps the legacy Kernel shell independent from Theia.
  var __unilabWorkbenchBackendProcess:
    | ChildProcessWithoutNullStreams
    | undefined
}

interface PackagedDeviceCardBuilderOptions {
  isPackaged: boolean
  resourcesPath: string
  platform?: NodeJS.Platform
  environment?: NodeJS.ProcessEnv
  log: (message: string) => void
  binaryExists?: (path: string) => boolean
}

interface WorkbenchBackendCleanupOptions {
  enabled: boolean
  observability: Pick<ElectronObservability, 'record' | 'run'>
  log: (message: string) => void
}

/**
 * Resolve the unpacked esbuild executable used by Device Card Builder.
 *
 * A valid launcher-provided path wins so the Workbench distribution can ship
 * a direct binary without duplicating the legacy desktop node_modules layout.
 */
export function configurePackagedDeviceCardBuilder(
  options: PackagedDeviceCardBuilderOptions
): void {
  if (!options.isPackaged) return
  const environment = options.environment ?? process.env
  const configuredBinary = environment['ESBUILD_BINARY_PATH']
  const binaryExists = options.binaryExists ?? existsSync
  if (configuredBinary && binaryExists(configuredBinary)) return
  const executable = (options.platform ?? process.platform) === 'win32'
    ? 'esbuild.exe'
    : 'esbuild'
  const binaryPath = join(
    options.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'esbuild',
    'bin',
    executable
  )
  if (!binaryExists(binaryPath)) {
    options.log(`Device Card Builder 缺少 esbuild binary: ${binaryPath}`)
    return
  }
  environment['ESBUILD_BINARY_PATH'] = binaryPath
}

/**
 * Stop the packaged Workbench-owned Theia backend during Electron shutdown.
 *
 * The launcher publishes only the child-process handle. This shared desktop
 * module keeps the bounded process-tree shutdown and observability contract in
 * one place while remaining a no-op for the legacy Kernel desktop surface.
 */
export async function cleanupPackagedWorkbenchBackend(
  options: WorkbenchBackendCleanupOptions
): Promise<void> {
  const backend = globalThis.__unilabWorkbenchBackendProcess
  if (!options.enabled || !backend) return
  try {
    await options.observability.run(
      'electron.workbench_backend.stop_on_quit',
      {},
      () => stopLocalRuntimeProcessTree(backend)
    )
    globalThis.__unilabWorkbenchBackendProcess = undefined
  } catch (error) {
    options.log(
      `退出时停止 Workbench backend 失败: ${error instanceof Error ? error.stack : String(error)}`
    )
    options.observability.record(
      'electron.workbench_backend.stop_on_quit_failed',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
  }
}
