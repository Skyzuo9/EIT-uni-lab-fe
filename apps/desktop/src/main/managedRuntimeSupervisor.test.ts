import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ManagedRuntimeSupervisorClient,
  type ManagedWorkerLaunch
} from './managedRuntimeSupervisor'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(
    directory,
    { recursive: true, force: true }
  )))
})

describe('ManagedRuntimeSupervisorClient', () => {
  it('starts a detached supervisor and controls its worker over the token seam', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'unilab-supervisor-'))
    temporaryDirectories.push(stateDirectory)
    let supervisorStarted = false
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init })
      if (!supervisorStarted) throw new Error('connect ECONNREFUSED')
      return new Response(JSON.stringify({
        status: init?.method === 'POST' ? 'running' : 'idle',
        worker: init?.method === 'POST' ? { pid: 42 } : null,
        error: null,
        simulator: {
          status: url.endsWith('/v1/simulators') ? 'running' : 'idle',
          pid: url.endsWith('/v1/simulators') ? 84 : null,
          error: null
        }
      }), {
        status: init?.method === 'POST' ? 201 : 200,
        headers: { 'content-type': 'application/json' }
      })
    })
    const startSupervisor = vi.fn(async () => {
      supervisorStarted = true
    })
    const client = new ManagedRuntimeSupervisorClient({
      supervisorExecutable: '/private/runtime/bin/unilab-supervisor',
      runtimePrefix: '/private/runtime',
      stateDirectory,
      port: 18_004,
      fetcher,
      startSupervisor,
      tokenFactory: () => 'fixed-supervisor-token'
    })

    await expect(client.connect()).resolves.toMatchObject({ status: 'idle' })
    expect(startSupervisor).toHaveBeenCalledWith({
      command: '/private/runtime/bin/unilab-supervisor',
      args: [
        '--host',
        '127.0.0.1',
        '--port',
        '18004',
        '--runtime-prefix',
        '/private/runtime',
        '--state-dir',
        stateDirectory,
        '--token-file',
        join(stateDirectory, 'token')
      ],
      cwd: stateDirectory
    })
    expect(await readFile(join(stateDirectory, 'token'), 'utf8')).toBe(
      'fixed-supervisor-token\n'
    )

    const launch: ManagedWorkerLaunch = {
      workspacePath: '/workspaces/plc-device',
      graphPath: '/workspaces/plc-device/graph.json',
      configPath: '/workspaces/plc-device/local_config.py',
      workingDirectory: '/user-data/runtime/plc-device',
      backend: 'ros'
    }
    await expect(client.startWorker(launch)).resolves.toMatchObject({
      status: 'running',
      worker: { pid: 42 }
    })
    expect(requests.at(-1)).toMatchObject({
      url: 'http://127.0.0.1:18004/v1/workers',
      init: {
        method: 'POST',
        headers: {
          Authorization: 'Bearer fixed-supervisor-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workspace_path: launch.workspacePath,
          graph_path: launch.graphPath,
          config_path: launch.configPath,
          working_dir: launch.workingDirectory,
          backend: launch.backend
        })
      }
    })

    await expect(client.startSimulator({
      kind: 'source',
      path: '/opt/PLC-Sim'
    })).resolves.toMatchObject({
      simulator: { status: 'running', pid: 84 }
    })
    expect(requests.at(-1)).toMatchObject({
      url: 'http://127.0.0.1:18004/v1/simulators',
      init: {
        method: 'POST',
        body: JSON.stringify({ source_path: '/opt/PLC-Sim' })
      }
    })
  })
})
