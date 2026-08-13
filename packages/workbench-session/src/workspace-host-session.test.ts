import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWorkspaceHostWorkbenchSession } from './index'

const roots: string[] = []
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve())
  })))
  await Promise.all(roots.splice(0).map(root => rm(root, {
    recursive: true,
    force: true
  })))
})

describe('Workspace Host Workbench adapter', () => {
  it('submits authenticated commands and observes external state changes', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'unilab-host-adapter-'))
    roots.push(workspacePath)
    const token = 'fixture-token'
    const operations = new Map<string, Record<string, unknown>>()
    const receivedCommands: string[] = []
    const snapshot = hostSnapshot(workspacePath)
    const server = createServer(async (request, response) => {
      if (request.headers.authorization !== `Bearer ${token}`) {
        sendJson(response, 401, { error: { message: 'unauthorized' } })
        return
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/v1/snapshot') {
        sendJson(response, 200, snapshot)
        return
      }
      if (request.method === 'GET' && url.pathname === '/v1/logs/backend') {
        sendJson(response, 200, { content: 'backend fixture log' })
        return
      }
      if (request.method === 'POST' && url.pathname === '/v1/operations') {
        const body = JSON.parse(await readBody(request)) as {
          operationId: string
          command: string
          parameters: Record<string, unknown>
        }
        receivedCommands.push(body.command)
        applyCommand(snapshot, body.command, body.parameters)
        const operation = {
          operationId: body.operationId,
          phase: 'succeeded',
          result: { revision: snapshot.revision },
          error: null
        }
        operations.set(body.operationId, operation)
        sendJson(response, 202, operation)
        return
      }
      const operationId = url.pathname.match(/^\/v1\/operations\/(.+)$/)?.[1]
      if (request.method === 'GET' && operationId) {
        const operation = operations.get(decodeURIComponent(operationId))
        sendJson(response, operation ? 200 : 404, operation ?? {
          error: { message: 'not found' }
        })
        return
      }
      sendJson(response, 404, { error: { message: 'not found' } })
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing port')
    snapshot.host.endpoint = `http://127.0.0.1:${address.port}`

    const runtime = join(workspacePath, '.unilabos', 'runtime', 'workbench')
    await mkdir(runtime, { recursive: true })
    await Promise.all([
      writeFile(join(runtime, 'session.json'), JSON.stringify(snapshot)),
      writeFile(join(runtime, 'host.token'), token)
    ])

    const session = createWorkspaceHostWorkbenchSession({
      workspacePath,
      backendAuthorityUrl: 'http://127.0.0.1:8080',
      environment: {
        UNILAB_WORKBENCH_RENDERER_URL: 'http://127.0.0.1:3100'
      }
    })
    await session.registerRenderer()
    const backend = await session.startWorkspaceBackend()

    expect(receivedCommands).toEqual(['renderer.attach', 'backend.start'])
    expect(backend).toMatchObject({
      phase: 'ready',
      identity: {
        workspacePath,
        pid: 4101,
        backendUrl: 'http://127.0.0.1:42001'
      }
    })
    expect(await session.readEnvironmentLog('workspace-backend'))
      .toBe('backend fixture log')

    const switched = await session.setDomainAuthority('backend')
    expect(receivedCommands.at(-1)).toBe('authority.switch')
    expect(switched).toMatchObject({
      configuredDomainMode: 'backend',
      configuredBackendUrl: 'http://127.0.0.1:8080'
    })

    snapshot.components.edge = component('edge', {
      phase: 'ready',
      pid: 4102,
      generation: 'edge-generation',
      capabilities: ['device-control']
    })
    snapshot.revision += 1
    snapshot.eventCursor += 1

    await vi.waitFor(() => {
      expect(session.getSnapshot().edgeRuntime).toMatchObject({
        phase: 'ready',
        pid: 4102,
        generation: 'edge-generation'
      })
    }, { timeout: 2_000 })

    await session.unregisterRenderer()
    expect(receivedCommands.at(-1)).toBe('renderer.detach')
    expect(snapshot.components.renderer.phase).toBe('idle')
  })
})

function hostSnapshot(workspacePath: string) {
  return {
    schemaVersion: 'unilab-workspace-host/v1' as const,
    revision: 1,
    eventCursor: 1,
    workspacePath,
    updatedAt: '2026-08-13T00:00:00Z',
    host: {
      phase: 'ready',
      pid: process.pid,
      endpoint: '',
      tokenPath: join(workspacePath, 'host.token'),
      platform: process.platform
    },
    configuration: {
      graphPath: 'deployment/graphs/fixture.json',
      runtimeMode: 'normal',
      domainMode: 'local',
      backendUrl: null as string | null
    },
    components: {
      backend: component('backend'),
      edge: component('edge'),
      plc: component('plc'),
      renderer: component('renderer')
    }
  }
}

function component(
  name: string,
  change: Partial<ReturnType<typeof componentShape>> = {}
) {
  return { ...componentShape(name), ...change }
}

function componentShape(name: string) {
  return {
    name,
    phase: 'idle',
    pid: null as number | null,
    address: null as string | null,
    generation: null as string | null,
    logPath: null as string | null,
    diagnostic: null as string | null,
    capabilities: [] as string[],
    metadata: {} as Record<string, unknown>
  }
}

function applyCommand(
  snapshot: ReturnType<typeof hostSnapshot>,
  command: string,
  parameters: Record<string, unknown>
) {
  if (command === 'backend.start') {
    snapshot.components.backend = component('backend', {
      phase: 'ready',
      pid: 4101,
      address: 'http://127.0.0.1:42001',
      generation: 'backend-generation',
      logPath: '/tmp/backend.log',
      capabilities: ['authoring', 'inventory', 'workflow-run'],
      metadata: {
        graphPath: 'deployment/graphs/fixture.json',
        graphFingerprint: 'fixture-fingerprint'
      }
    })
  } else if (command === 'renderer.attach') {
    snapshot.components.renderer = component('renderer', {
      phase: 'ready',
      pid: Number(parameters['pid']),
      address: String(parameters['address']),
      generation: String(parameters['generation']),
      capabilities: ['workbench-ui', 'theia-rpc']
    })
  } else if (command === 'renderer.detach') {
    snapshot.components.renderer = component('renderer')
  } else if (command === 'authority.switch') {
    snapshot.configuration.domainMode = String(parameters['mode'])
    snapshot.configuration.backendUrl = parameters['backendUrl'] == null
      ? null
      : String(parameters['backendUrl'])
  }
  snapshot.revision += 1
  snapshot.eventCursor += 1
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown
) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}
