import { EventEmitter } from 'node:events'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ElectronObservability } from './observability'
import {
  cleanupPackagedWorkbenchBackend,
  cleanupPackagedWorkbenchRemoteAccess,
  configureParentProcessWorkbenchRemoteAccess,
  configurePackagedDeviceCardBuilder,
  getPackagedWorkbenchRemoteAccess,
  startPackagedWorkbenchRemoteAccess,
  stopPackagedWorkbenchRemoteAccess
} from './packagedRuntime'
import type {
  WorkbenchRemoteAccessController,
  WorkbenchRemoteAccessSnapshot
} from '../shared/workbenchRemote'

afterEach(() => {
  globalThis.__unilabWorkbenchBackendProcess = undefined
  globalThis.__unilabWorkbenchRemoteAccessController = undefined
})

describe('packaged runtime integration', () => {
  it('preserves a valid launcher-provided esbuild binary', () => {
    const environment: NodeJS.ProcessEnv = {
      ESBUILD_BINARY_PATH: '/Applications/UniLab/resources/esbuild'
    }
    configurePackagedDeviceCardBuilder({
      isPackaged: true,
      resourcesPath: '/Applications/UniLab/resources',
      platform: 'darwin',
      environment,
      log: vi.fn(),
      binaryExists: (path) => path === environment['ESBUILD_BINARY_PATH']
    })

    expect(environment['ESBUILD_BINARY_PATH']).toBe(
      '/Applications/UniLab/resources/esbuild'
    )
  })

  it('resolves the legacy unpacked esbuild binary when no path is configured', () => {
    const environment: NodeJS.ProcessEnv = {}
    configurePackagedDeviceCardBuilder({
      isPackaged: true,
      resourcesPath: '/Applications/UniLab/resources',
      platform: 'darwin',
      environment,
      log: vi.fn(),
      binaryExists: (path) => path.endsWith('/esbuild/bin/esbuild')
    })

    expect(environment['ESBUILD_BINARY_PATH']).toBe(
      '/Applications/UniLab/resources/app.asar.unpacked/node_modules/esbuild/bin/esbuild'
    )
  })

  it('stops and clears a Workbench backend handed off by the launcher', async () => {
    const backend = Object.assign(new EventEmitter(), {
      exitCode: 0,
      pid: 123
    }) as ChildProcessWithoutNullStreams
    globalThis.__unilabWorkbenchBackendProcess = backend
    const run = vi.fn()
    const record = vi.fn()
    const observability: Pick<ElectronObservability, 'record' | 'run'> = {
      async run<T>(
        name: string,
        attributes: Record<string, string | number | boolean | undefined>,
        operation: () => Promise<T>
      ): Promise<T> {
        run(name, attributes, operation)
        return operation()
      },
      record
    }

    await cleanupPackagedWorkbenchBackend({
      enabled: true,
      observability,
      log: vi.fn()
    })

    expect(run).toHaveBeenCalledWith(
      'electron.workbench_backend.stop_on_quit',
      {},
      expect.any(Function)
    )
    expect(globalThis.__unilabWorkbenchBackendProcess).toBeUndefined()
  })

  it('does not consume the launcher hand-off for the Kernel surface', async () => {
    const backend = Object.assign(new EventEmitter(), {
      exitCode: 0,
      pid: 123
    }) as ChildProcessWithoutNullStreams
    globalThis.__unilabWorkbenchBackendProcess = backend
    const run = vi.fn()
    const observability: Pick<ElectronObservability, 'record' | 'run'> = {
      async run<T>(
        name: string,
        attributes: Record<string, string | number | boolean | undefined>,
        operation: () => Promise<T>
      ): Promise<T> {
        run(name, attributes, operation)
        return operation()
      },
      record: vi.fn()
    }

    await cleanupPackagedWorkbenchBackend({
      enabled: false,
      observability,
      log: vi.fn()
    })

    expect(run).not.toHaveBeenCalled()
    expect(globalThis.__unilabWorkbenchBackendProcess).toBe(backend)
  })

  it('projects and controls the launcher-owned remote entrance', async () => {
    const ready = {
      phase: 'ready' as const,
      origin: 'https://workbench.example.test',
      accessUrl: 'https://workbench.example.test/__unilab/auth#token=secret',
      pid: 123,
      generation: 'generation-1234567890',
      expiresAt: 1_800_000_000_000,
      error: null
    }
    const idle = {
      ...ready,
      phase: 'idle' as const,
      origin: null,
      accessUrl: null
    }
    const controller: WorkbenchRemoteAccessController = {
      getSnapshot: vi.fn(() => idle),
      start: vi.fn(async () => ready),
      stop: vi.fn(async () => idle),
      close: vi.fn(async () => idle)
    }
    globalThis.__unilabWorkbenchRemoteAccessController = controller

    expect(getPackagedWorkbenchRemoteAccess()).toEqual(idle)
    expect(await startPackagedWorkbenchRemoteAccess()).toEqual(ready)
    expect(await stopPackagedWorkbenchRemoteAccess()).toEqual(idle)
    expect(controller.start).toHaveBeenCalledOnce()
    expect(controller.stop).toHaveBeenCalledOnce()
  })

  it('stops remote access before releasing the packaged hand-off', async () => {
    const idle: WorkbenchRemoteAccessSnapshot = {
      phase: 'idle',
      origin: null,
      accessUrl: null,
      pid: null,
      generation: null,
      expiresAt: null,
      error: null
    }
    const controller: WorkbenchRemoteAccessController = {
      getSnapshot: vi.fn(() => idle),
      start: vi.fn(async () => idle),
      stop: vi.fn(async () => idle),
      close: vi.fn(async () => idle)
    }
    globalThis.__unilabWorkbenchRemoteAccessController = controller
    const observability: Pick<ElectronObservability, 'record' | 'run'> = {
      async run<T>(
        _name: string,
        _attributes: Record<string, string | number | boolean | undefined>,
        operation: () => Promise<T>
      ): Promise<T> {
        return operation()
      },
      record: vi.fn()
    }

    await cleanupPackagedWorkbenchRemoteAccess({
      enabled: true,
      observability,
      log: vi.fn()
    })

    expect(controller.close).toHaveBeenCalledOnce()
    expect(globalThis.__unilabWorkbenchRemoteAccessController).toBeUndefined()
  })

  it('bridges development Electron controls to the launcher process', async () => {
    const sent: unknown[] = []
    let listener: (message: unknown) => void = () => undefined
    configureParentProcessWorkbenchRemoteAccess({
      environment: { UNILAB_WORKBENCH_REMOTE_PARENT_IPC: '1' },
      send(message) {
        sent.push(message)
        return true
      },
      subscribe(nextListener) {
        listener = nextListener
        return () => { listener = () => undefined }
      }
    })
    const pending = startPackagedWorkbenchRemoteAccess()
    const request = sent[0] as {
      channel: string
      requestId: number
      operation: string
    }
    expect(request.operation).toBe('start')
    const snapshot = {
      phase: 'ready' as const,
      origin: 'https://workbench.example.test',
      accessUrl: 'https://workbench.example.test/__unilab/auth#token=secret',
      pid: 123,
      generation: 'generation-1234567890',
      expiresAt: 1_800_000_000_000,
      error: null
    }
    listener({
      channel: 'unilab-workbench-remote-response',
      requestId: request.requestId,
      ok: true,
      snapshot
    })
    await expect(pending).resolves.toEqual(snapshot)
  })
})
