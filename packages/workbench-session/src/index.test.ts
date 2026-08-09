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
    expect(ready.identity?.packageMounts).toMatchObject({
      schemaVersion: 'workspace-package-mounts/v1',
      editablePackageId: 'fixture_lab',
      items: [{
        packageId: 'fixture_lab',
        editable: true,
        readOnly: false,
        packageRootUri: `file://${fixture.workspacePath}/fixture_lab`
      }]
    })
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

  it('deduplicates starts and restarts with a new process generation', async () => {
    const fixture = await createFixture()
    const session = createManagedLocalWorkbenchSession({
      workspacePath: fixture.workspacePath,
      osProjectPath: fixture.osProjectPath,
      environmentPath: fixture.environmentPath,
      readinessTimeoutMs: 5_000
    })
    sessions.push(session)

    const [first, duplicate] = await Promise.all([session.start(), session.start()])
    expect(duplicate.identity?.generation).toBe(first.identity?.generation)
    const firstPid = first.identity?.pid ?? 0
    const restarted = await session.restart()

    expect(restarted.phase).toBe('ready')
    expect(restarted.identity?.generation).not.toBe(first.identity?.generation)
    expect(restarted.identity?.pid).not.toBe(firstPid)
    expect(await session.readLogTail()).toContain(
      `generation=${restarted.identity?.generation}`
    )
    await session.stop()
    expect(session.getSnapshot()).toEqual({
      phase: 'idle',
      message: 'Uni-Lab OS 已停止',
      identity: null,
      diagnostic: null
    })
  })

  it('stops during readiness without publishing a false failure', async () => {
    const fixture = await createFixture()
    const session = createManagedLocalWorkbenchSession({
      workspacePath: fixture.workspacePath,
      osProjectPath: fixture.osProjectPath,
      environmentPath: fixture.environmentPath,
      readinessTimeoutMs: 5_000
    })
    sessions.push(session)
    const waiting = new Promise<void>(resolveWaiting => {
      const disposable = session.onDidChange(snapshot => {
        if (snapshot.phase !== 'waiting') return
        disposable.dispose()
        resolveWaiting()
      })
    })

    const starting = session.start()
    await waiting
    await session.stop()

    await expect(starting).resolves.toMatchObject({ phase: 'idle' })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'idle',
      identity: null,
      diagnostic: null
    })
  })

  it('fails closed with logs when OS exits before readiness', async () => {
    const fixture = await createFixture()
    const session = createManagedLocalWorkbenchSession({
      workspacePath: fixture.workspacePath,
      osProjectPath: fixture.osProjectPath,
      environmentPath: fixture.environmentPath,
      environment: { UNILAB_FIXTURE_EXIT_BEFORE_READY: '1' },
      readinessTimeoutMs: 1_000
    })
    sessions.push(session)

    await expect(session.start()).rejects.toThrow(/就绪前退出|fetch failed/)
    const failed = session.getSnapshot()
    expect(failed).toMatchObject({
      phase: 'failed',
      diagnostic: { code: 'os_readiness_failed' }
    })
    expect(failed.identity?.logPath).toContain('/.unilabos/logs/workbench/')
  })

  it('publishes an actionable failure and clears the child after a runtime crash', async () => {
    const fixture = await createFixture()
    const session = createManagedLocalWorkbenchSession({
      workspacePath: fixture.workspacePath,
      osProjectPath: fixture.osProjectPath,
      environmentPath: fixture.environmentPath,
      environment: {
        ...process.env,
        UNILAB_FIXTURE_EXIT_AFTER_READY_MS: '250'
      },
      readinessTimeoutMs: 5_000
    })
    sessions.push(session)
    const failed = new Promise<void>(resolveFailed => {
      const disposable = session.onDidChange(snapshot => {
        if (snapshot.phase !== 'failed') return
        disposable.dispose()
        resolveFailed()
      })
    })

    await session.start()
    await failed
    expect(session.getSnapshot()).toMatchObject({
      phase: 'failed',
      diagnostic: { code: 'os_exited' }
    })
    await expect(session.stop()).resolves.toMatchObject({ phase: 'idle' })
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
if (process.env.UNILAB_FIXTURE_EXIT_BEFORE_READY === '1') process.exit(17)
let exitScheduled = false
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
  if (request.url === '/api/v1/workspace/package-mounts') {
    if (process.env.UNILAB_FIXTURE_EXIT_AFTER_READY_MS && !exitScheduled) {
      exitScheduled = true
      setTimeout(() => process.exit(23), Number(process.env.UNILAB_FIXTURE_EXIT_AFTER_READY_MS))
    }
    return json(response, {
      code: 0,
      data: {
        schemaVersion: 'workspace-package-mounts/v1',
        editablePackageId: 'fixture_lab',
        dependencyRevision: 'sha256:none',
        catalogRevision: 'sha256:catalog',
        mountRevision: 'sha256:mount',
        items: [{
          packageId: 'fixture_lab',
          distributionName: 'fixture-lab',
          version: '1.0.0',
          namespace: 'community.fixture_lab',
          editable: true,
          readOnly: false,
          sourceKind: 'workspace',
          importRootUri: 'file://' + process.cwd(),
          packageRootUri: 'file://' + process.cwd() + '/fixture_lab',
          contentDigest: 'sha256:content',
          catalogDigest: 'sha256:catalog'
        }]
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
