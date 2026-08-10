import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STARTUP_TIMEOUT_MS = 15_000

export async function verifyPackagedBackend(appPath) {
  const resources = path.join(appPath, 'Contents', 'Resources')
  const nodeBinary = path.join(resources, 'node-runtime', 'bin', 'node')
  const backendMain = path.join(resources, 'workbench', 'lib', 'backend', 'main.js')
  const plugins = path.join(resources, 'workbench', 'plugins')
  const workbench = path.join(resources, 'workbench')
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'unilab-backend-smoke-'))
  const port = await reserveLoopbackPort()
  let output = ''
  let launchError = null
  const child = spawn(nodeBinary, [
    backendMain,
    workspace,
    '--hostname=127.0.0.1',
    '--port',
    String(port),
    `--plugins=local-dir:${plugins}`
  ], {
    cwd: workbench,
    env: {
      ...process.env,
      THEIA_WORKSPACE: workspace
    },
    detached: true,
    shell: false
  })
  child.stdout.on('data', chunk => {
    output = appendBounded(output, chunk)
  })
  child.stderr.on('data', chunk => {
    output = appendBounded(output, chunk)
  })
  child.once('error', error => {
    launchError = error
  })

  try {
    await waitForHttp(port, child, () => launchError)
    console.log(`打包 backend smoke 通过：Node ${await executableVersion(nodeBinary)}，端口 ${port}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\n${output}`)
  } finally {
    await stopProcessTree(child)
    await rm(workspace, { recursive: true, force: true })
  }
}

async function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForHttp(port, child, readLaunchError) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const launchError = readLaunchError()
    if (launchError) throw launchError
    if (child.exitCode !== null) {
      throw new Error(`打包 backend 提前退出，退出码 ${child.exitCode}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) return
    } catch {
      // Backend startup is expected to refuse connections briefly.
    }
    await delay(100)
  }
  throw new Error(`打包 backend 在 ${STARTUP_TIMEOUT_MS / 1000} 秒内未监听`)
}

async function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    new Promise(resolve => child.once('close', resolve)),
    delay(5_000)
  ])
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

async function executableVersion(executable) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--version'], { shell: false })
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk
    })
    child.once('error', reject)
    child.once('close', code => {
      if (code === 0) resolve(output.trim())
      else reject(new Error(`Node version probe exited ${code}`))
    })
  })
}

function appendBounded(existing, chunk) {
  return `${existing}${String(chunk)}`.slice(-16_384)
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appIndex = process.argv.indexOf('--app')
  const appPath = appIndex >= 0 ? process.argv[appIndex + 1] : null
  if (!appPath) {
    console.error('用法：verify-packaged-backend.mjs --app /path/to/UniLab Workbench.app')
    process.exitCode = 1
  } else {
    try {
      await verifyPackagedBackend(appPath)
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    }
  }
}
