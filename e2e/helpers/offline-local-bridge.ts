import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface OfflineLocalBridge {
  url: string
  logs: () => string
  stop: () => Promise<void>
}

export async function startOfflineLocalBridge(
  nodeDelaySeconds = 1.5
): Promise<OfflineLocalBridge> {
  const externalUrl = process.env.UNILAB_DEBUG_ACTIONS_E2E_URL
  if (externalUrl) {
    await waitUntilReady(externalUrl, () => '')
    return {
      url: externalUrl.replace(/\/$/, ''),
      logs: () => 'using external UNILAB_DEBUG_ACTIONS_E2E_URL',
      stop: async () => {}
    }
  }

  const [apiPort, schedulePort] = await Promise.all([
    availablePort(),
    availablePort()
  ])
  const directory = mkdtempSync(join(tmpdir(), 'unilab-debug-actions-'))
  const osRepository = resolve(process.cwd(), '../Uni-Lab-OS')
  const python = process.env.UNILAB_PY ||
    '/home/changjunhan/.micromamba/envs/unilab/bin/python'
  const child = spawn(
    python,
    [
      '-m',
      'unilabos.app.local_bridge.server',
      '--offline',
      '--api-port',
      String(apiPort),
      '--schedule-port',
      String(schedulePort),
      '--offline-node-delay',
      String(nodeDelaySeconds),
      '--journal-path',
      join(directory, 'runtime.sqlite')
    ],
    {
      cwd: osRepository,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  let output = ''
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString()
  })
  const url = `http://127.0.0.1:${apiPort}`

  try {
    await waitUntilReady(url, () => output, child)
  } catch (error) {
    await stopChild(child)
    rmSync(directory, { recursive: true, force: true })
    throw error
  }

  return {
    url,
    logs: () => output,
    stop: async () => {
      await stopChild(child)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('failed to allocate a loopback test port'))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) reject(error)
        else resolvePort(port)
      })
    })
  })
}

async function waitUntilReady(
  url: string,
  logs: () => string,
  child?: ChildProcess
): Promise<void> {
  const deadline = Date.now() + 30_000
  const endpoint = `${url.replace(/\/$/, '')}/api/v1/runtime/capabilities`
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `offline local bridge exited with ${child.exitCode}\n${logs()}`
      )
    }
    try {
      const response = await fetch(endpoint)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`offline local bridge did not become ready\n${logs()}`)
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exitPromise = new Promise<boolean>((resolveExit) => {
    child.once('exit', () => resolveExit(true))
  })
  child.kill('SIGTERM')
  const exited = await Promise.race([
    exitPromise,
    new Promise<boolean>((resolveTimeout) => {
      setTimeout(() => resolveTimeout(false), 3_000)
    })
  ])
  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise<void>((resolveExit) => {
      child.once('exit', () => resolveExit())
    })
  }
}
