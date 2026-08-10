import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { ElectronObservability } from './observability'
import { stopLocalRuntimeProcessTree } from './localRuntimeProcess'
import {
  UNAVAILABLE_WORKBENCH_REMOTE_ACCESS,
  type WorkbenchRemoteAccessController,
  type WorkbenchRemoteAccessSnapshot
} from '../shared/workbenchRemote'

declare global {
  // The packaged Workbench launcher owns the Theia backend, while the shared
  // Electron main owns the application quit contract. The explicit hand-off
  // keeps the legacy Kernel shell independent from Theia.
  var __unilabWorkbenchBackendProcess:
    | ChildProcessWithoutNullStreams
    | undefined
  var __unilabWorkbenchRemoteAccessController:
    | WorkbenchRemoteAccessController
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

export function getPackagedWorkbenchRemoteAccess():
  WorkbenchRemoteAccessSnapshot | Promise<WorkbenchRemoteAccessSnapshot> {
  return globalThis.__unilabWorkbenchRemoteAccessController?.getSnapshot()
    ?? Promise.resolve(UNAVAILABLE_WORKBENCH_REMOTE_ACCESS)
}

export async function startPackagedWorkbenchRemoteAccess():
  Promise<WorkbenchRemoteAccessSnapshot> {
  const controller = globalThis.__unilabWorkbenchRemoteAccessController
  if (!controller) throw new Error('当前桌面应用没有可用的远程访问控制器')
  return controller.start()
}

export async function stopPackagedWorkbenchRemoteAccess():
  Promise<WorkbenchRemoteAccessSnapshot> {
  const controller = globalThis.__unilabWorkbenchRemoteAccessController
  if (!controller) return UNAVAILABLE_WORKBENCH_REMOTE_ACCESS
  return controller.stop()
}

export async function cleanupPackagedWorkbenchRemoteAccess(options: {
  enabled: boolean
  observability: Pick<ElectronObservability, 'record' | 'run'>
  log: (message: string) => void
}): Promise<void> {
  const controller = globalThis.__unilabWorkbenchRemoteAccessController
  if (!options.enabled || !controller) return
  try {
    await options.observability.run(
      'electron.workbench_remote.stop_on_quit',
      {},
      () => controller.close()
    )
    globalThis.__unilabWorkbenchRemoteAccessController = undefined
  } catch (error) {
    options.log(
      `退出时停止 Workbench 远程访问失败: ${error instanceof Error ? error.stack : String(error)}`
    )
    options.observability.record(
      'electron.workbench_remote.stop_on_quit_failed',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
  }
}

export async function cleanupPackagedWorkbench(options: {
  enabled: boolean
  observability: Pick<ElectronObservability, 'record' | 'run'>
  log: (message: string) => void
}): Promise<void> {
  await cleanupPackagedWorkbenchRemoteAccess(options)
  await cleanupPackagedWorkbenchBackend(options)
}

const REMOTE_PARENT_REQUEST = 'unilab-workbench-remote-request'
const REMOTE_PARENT_RESPONSE = 'unilab-workbench-remote-response'

/** Connects the development Electron shell to its Node launcher over local IPC. */
export function configureParentProcessWorkbenchRemoteAccess(options: {
  environment?: NodeJS.ProcessEnv
  send?: (message: unknown) => boolean
  subscribe?: (listener: (message: unknown) => void) => () => void
  timeoutMs?: number
} = {}): void {
  const environment = options.environment ?? process.env
  if (
    environment['UNILAB_WORKBENCH_REMOTE_PARENT_IPC'] !== '1'
    || globalThis.__unilabWorkbenchRemoteAccessController
  ) return
  const send = options.send ?? ((message) => process.send?.(message) ?? false)
  const subscribe = options.subscribe ?? ((listener) => {
    process.on('message', listener)
    return () => process.off('message', listener)
  })
  const timeoutMs = options.timeoutMs ?? 10_000
  let nextRequestId = 1
  const pending = new Map<number, {
    resolve: (snapshot: WorkbenchRemoteAccessSnapshot) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  const unsubscribe = subscribe((message) => {
    if (!isRemoteParentResponse(message)) return
    const request = pending.get(message.requestId)
    if (!request) return
    pending.delete(message.requestId)
    clearTimeout(request.timer)
    if (message.ok) request.resolve(message.snapshot)
    else request.reject(new Error(message.error))
  })
  const request = (
    operation: 'getSnapshot' | 'start' | 'stop'
  ): Promise<WorkbenchRemoteAccessSnapshot> => new Promise((resolve, reject) => {
    const requestId = nextRequestId
    nextRequestId += 1
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('等待 Workbench 远程访问控制器超时'))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    if (!send({ channel: REMOTE_PARENT_REQUEST, requestId, operation })) {
      clearTimeout(timer)
      pending.delete(requestId)
      reject(new Error('Workbench 启动器 IPC 不可用'))
    }
  })
  globalThis.__unilabWorkbenchRemoteAccessController = {
    getSnapshot: () => request('getSnapshot'),
    start: () => request('start'),
    stop: () => request('stop'),
    async close() {
      try {
        return await request('stop')
      } finally {
        unsubscribe()
      }
    }
  }
}

function isRemoteParentResponse(value: unknown): value is {
  channel: typeof REMOTE_PARENT_RESPONSE
  requestId: number
  ok: true
  snapshot: WorkbenchRemoteAccessSnapshot
} | {
  channel: typeof REMOTE_PARENT_RESPONSE
  requestId: number
  ok: false
  error: string
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (
    candidate['channel'] !== REMOTE_PARENT_RESPONSE
    || !Number.isSafeInteger(candidate['requestId'])
    || typeof candidate['ok'] !== 'boolean'
  ) return false
  return candidate['ok']
    ? validRemoteAccessSnapshot(candidate['snapshot'])
    : typeof candidate['error'] === 'string'
}

function validRemoteAccessSnapshot(value: unknown):
  value is WorkbenchRemoteAccessSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate['phase'] === 'string'
    && (candidate['origin'] === null || typeof candidate['origin'] === 'string')
    && (
      candidate['accessUrl'] === null
      || typeof candidate['accessUrl'] === 'string'
    )
    && (candidate['pid'] === null || Number.isSafeInteger(candidate['pid']))
    && (
      candidate['generation'] === null
      || typeof candidate['generation'] === 'string'
    )
    && (
      candidate['expiresAt'] === null
      || Number.isSafeInteger(candidate['expiresAt'])
    )
    && (candidate['error'] === null || typeof candidate['error'] === 'string')
}
