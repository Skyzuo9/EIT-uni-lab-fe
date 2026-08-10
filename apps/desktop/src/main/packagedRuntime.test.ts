import { EventEmitter } from 'node:events'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ElectronObservability } from './observability'
import {
  cleanupPackagedWorkbenchBackend,
  configurePackagedDeviceCardBuilder
} from './packagedRuntime'

afterEach(() => {
  globalThis.__unilabWorkbenchBackendProcess = undefined
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
})
