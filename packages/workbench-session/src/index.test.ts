import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createManagedLocalWorkbenchSession,
  type WorkbenchSession
} from './index'

const sessions: WorkbenchSession[] = []
const fixtureRoots: string[] = []

afterEach(async () => {
  await Promise.allSettled(sessions.splice(0).map(session => session.stop()))
  await Promise.all(fixtureRoots.splice(0).map(root => rm(root, {
    recursive: true,
    force: true
  })))
})

describe('managed local Workbench session', () => {
  it('publishes normalized identity and diagnostics only after OS readiness', async () => {
    const fixture = await createFixture()
    const phases: string[] = []
    const session = createManagedLocalWorkbenchSession({
      workspacePath: fixture.workspacePath,
      osProjectPath: fixture.osProjectPath,
      environmentPath: fixture.environmentPath,
      readinessTimeoutMs: 5_000
    })
    sessions.push(session)
    session.onDidChange(snapshot => phases.push(snapshot.phase))

    const ready = await session.start()

    expect(phases).toEqual([
      'validating',
      'starting',
      'waiting',
      'ready'
    ])
    expect(ready).toMatchObject({
      phase: 'ready',
      diagnostic: null,
      identity: {
        workspacePath: fixture.workspacePath,
        osProjectPath: fixture.osProjectPath,
        environmentPath: fixture.environmentPath,
        graphPath: join(
          fixture.workspacePath,
          'deployment',
          'graphs',
          'szlab-local-debug.json'
        ),
        mode: 'simulation'
      }
    })
    expect(ready.identity?.pid).toBeGreaterThan(0)
    expect(ready.identity?.generation).toMatch(/^[0-9a-f-]{36}$/)
    expect(ready.identity?.backendUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(ready.identity?.logPath).toBe(join(
      fixture.workspacePath,
      '.unilabos',
      'logs',
      'workbench',
      `${ready.identity?.generation}.log`
    ))
    await expect(readFile(
      join(fixture.workspacePath, '.unilabos', '.gitignore'),
      'utf8'
    )).resolves.toMatch(/(^|\n)agent\/\n/)
  })

  it('fails closed when the explicitly selected Python environment is invalid', async () => {
    const fixture = await createFixture()
    const session = createManagedLocalWorkbenchSession({
      workspacePath: fixture.workspacePath,
      osProjectPath: fixture.osProjectPath,
      environmentPath: join(fixture.environmentPath, 'missing'),
      environment: {
        PATH: join(fixture.environmentPath, 'bin')
      },
      readinessTimeoutMs: 1_000
    })
    sessions.push(session)

    await expect(session.start()).rejects.toThrow(
      '显式选择的 Python 环境不可用'
    )
    expect(session.getSnapshot()).toMatchObject({
      phase: 'failed',
      identity: null,
      diagnostic: {
        code: 'python_environment_not_found'
      }
    })
  })

  it('fails closed without touching a process that owns an explicit port', async () => {
    const fixture = await createFixture()
    const owner = createServer()
    await new Promise<void>((resolveListen, reject) => {
      owner.once('error', reject)
      owner.listen(0, '127.0.0.1', resolveListen)
    })
    const address = owner.address()
    if (!address || typeof address === 'string') {
      owner.close()
      throw new Error('fixture server did not expose a TCP port')
    }
    const session = createManagedLocalWorkbenchSession({
      workspacePath: fixture.workspacePath,
      osProjectPath: fixture.osProjectPath,
      environmentPath: fixture.environmentPath,
      backendPort: address.port,
      readinessTimeoutMs: 1_000
    })
    sessions.push(session)

    try {
      await expect(session.start()).rejects.toThrow('已被占用')
      expect(session.getSnapshot()).toMatchObject({
        phase: 'failed',
        identity: null,
        diagnostic: {
          code: 'port_conflict'
        }
      })
      expect(owner.listening).toBe(true)
    } finally {
      await new Promise<void>(resolveClose => owner.close(() => resolveClose()))
    }
  })
})

async function createFixture(): Promise<{
  workspacePath: string
  osProjectPath: string
  environmentPath: string
}> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'unilab-workbench-session-'))
  )
  fixtureRoots.push(root)
  const workspacePath = join(root, 'Uni-Lab-SZLab')
  const osProjectPath = join(root, 'Uni-Lab-OS')
  const environmentPath = join(root, 'unilab-env')
  await Promise.all([
    mkdir(join(workspacePath, 'deployment', 'graphs'), { recursive: true }),
    mkdir(join(osProjectPath, 'unilabos'), { recursive: true }),
    mkdir(join(environmentPath, 'bin'), { recursive: true })
  ])
  await Promise.all([
    writeFile(join(workspacePath, 'deployment', 'local_config.py'), 'class BasicConfig:\n    pass\n'),
    writeFile(
      join(workspacePath, 'deployment', 'graphs', 'szlab-local-debug.json'),
      '{}\n'
    ),
    writeFile(join(environmentPath, 'bin', 'python'), '#!/bin/sh\nexit 0\n'),
    writeFile(join(environmentPath, 'bin', 'unilab'), fakeUnilabExecutable())
  ])
  await Promise.all([
    chmod(join(environmentPath, 'bin', 'python'), 0o755),
    chmod(join(environmentPath, 'bin', 'unilab'), 0o755)
  ])
  return { workspacePath, osProjectPath, environmentPath }
}

function fakeUnilabExecutable(): string {
  return `#!/usr/bin/env node
const http = require('node:http')
const args = process.argv.slice(2)
const port = Number(args[args.indexOf('--port') + 1])
const json = (response, body) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
const server = http.createServer((request, response) => {
  if (request.url === '/api/v1/health') return json(response, { status: 'ok' })
  if (request.url === '/api/v1/workflow-node-templates') {
    return json(response, { code: 0, data: { items: [] } })
  }
  if (request.url === '/api/v1/devices') {
    return json(response, {
      code: 0,
      data: {
        schemaVersion: 'device-catalog/v1',
        items: [{ id: 'fixture_device', actions: ['ping'] }]
      }
    })
  }
  response.writeHead(404)
  response.end()
})
server.listen(port, '127.0.0.1')
const stop = () => server.close(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
`
}
