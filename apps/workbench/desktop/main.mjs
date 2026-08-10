import { spawn } from 'node:child_process'
import { appendFileSync, createWriteStream, mkdirSync } from 'node:fs'
import {
  access,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile
} from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { app, dialog } from 'electron'

import {
  createWorkbenchRendererUrl,
  discoverWorkbenchPythonEnvironment,
  resolveWorkbenchLaunchConfiguration
} from '../scripts/workbench-launch.mjs'
import { createRemoteWorkbenchController } from '../scripts/remote-controller.mjs'

const CONFIG_VERSION = 1
const STARTUP_TIMEOUT_MS = 60_000
const BACKEND_STOP_TIMEOUT_MS = 5_000

let backendProcess
let remoteAccessController

void startPackagedWorkbench().catch(async error => {
  await stopBackendProcess(backendProcess)
  const message = error instanceof Error ? error.message : String(error)
  const diagnostic = error instanceof Error ? error.stack ?? message : message
  await app.whenReady()
  try {
    const diagnosticDirectory = app.getPath('userData')
    mkdirSync(diagnosticDirectory, { recursive: true })
    appendFileSync(
      path.join(diagnosticDirectory, 'workbench-launcher-error.log'),
      `[${new Date().toISOString()}] ${diagnostic}\n`
    )
  } catch {
    // The native error dialog remains available if diagnostic persistence fails.
  }
  console.error(diagnostic)
  dialog.showErrorBox('UniLab Workbench 无法启动', message)
  app.exit(1)
})

async function startPackagedWorkbench() {
  await app.whenReady()
  const argumentsAfterExecutable = process.argv.slice(1)
  const parsed = resolveWorkbenchLaunchConfiguration(
    argumentsAfterExecutable,
    process.env,
    process.cwd()
  )
  const configPath = path.join(app.getPath('userData'), 'workbench-launch.json')
  const persisted = await readPersistedConfiguration(configPath)
  const hasExplicitWorkspace = argumentsAfterExecutable.includes('--workspace')
    || Boolean(process.env['THEIA_WORKSPACE']?.trim())
  const workspace = await selectWorkspace(
    hasExplicitWorkspace ? parsed.workspace : persisted.workspace
  )
  const hasExplicitEnvironment = argumentsAfterExecutable.includes('--python-env')
    || Boolean(process.env['UNILAB_PYTHON_ENV']?.trim())
  const pythonEnvironment = await selectPythonEnvironment({
    explicit: hasExplicitEnvironment ? parsed.pythonEnvironment : null,
    persisted: persisted.pythonEnvironment
  })
  const osProject = await selectOptionalDirectory(
    parsed.osProject ?? persisted.osProject
  )
  const port = await findAvailableLoopbackPort(parsed.port)

  await writePersistedConfiguration(configPath, {
    version: CONFIG_VERSION,
    workspace,
    pythonEnvironment,
    osProject
  })

  const resources = resolvePackagedResources()
  await Promise.all([
    access(resources.backendMain),
    access(resources.desktopMain),
    access(resources.plugins),
    access(resources.nodeBinary)
  ])
  const logDirectory = path.join(workspace, '.unilabos', 'logs')
  await mkdir(logDirectory, { recursive: true })
  const logStream = createWriteStream(
    path.join(logDirectory, 'workbench-desktop-launcher.log'),
    { flags: 'a' }
  )
  logStream.write(`\n[${new Date().toISOString()}] launch port=${port}\n`)

  const childEnvironment = {
    ...process.env,
    THEIA_WORKSPACE: workspace,
    UNILAB_PYTHON_ENV: pythonEnvironment,
    UNILAB_DESKTOP_SURFACE: 'workbench',
    UNILAB_AGENT_ICON: resources.brandIcon,
    UNILAB_AIONUI_APP: '/Applications/AionUi.app'
  }
  if (osProject) childEnvironment.UNILAB_OS_PROJECT = osProject
  else delete childEnvironment.UNILAB_OS_PROJECT

  backendProcess = spawn(resources.nodeBinary, [
    resources.backendMain,
    workspace,
    '--hostname=127.0.0.1',
    '--port',
    String(port),
    `--plugins=local-dir:${resources.plugins}`
  ], {
    cwd: resources.workbench,
    env: childEnvironment,
    detached: process.platform !== 'win32',
    shell: false,
    windowsHide: true
  })
  backendProcess.stdout.pipe(logStream, { end: false })
  backendProcess.stderr.pipe(logStream, { end: false })
  backendProcess.once('close', (code, signal) => {
    void remoteAccessController?.close().catch(() => undefined)
    logStream.end(
      `[${new Date().toISOString()}] backend exit code=${String(code)} signal=${String(signal)}\n`
    )
  })
  globalThis.__unilabWorkbenchBackendProcess = backendProcess

  const rendererUrl = createWorkbenchRendererUrl({
    port,
    workspace,
    workflowUuid: parsed.workflowUuid
  })
  await waitForWorkbench(rendererUrl, backendProcess, STARTUP_TIMEOUT_MS)

  const remoteLaunch = resolveWorkbenchLaunchConfiguration(
    ['--remote', '--port', String(port)],
    process.env,
    process.cwd()
  )
  const remoteConfiguration = {
    ...remoteLaunch.remote,
    accessUrlFile: remoteLaunch.remote.accessUrlFile ?? path.join(
      app.getPath('userData'),
      'runtime',
      'remote-access.url'
    )
  }
  remoteAccessController = createRemoteWorkbenchController({
    backendPort: port,
    workspacePath: workspace,
    rendererUrl,
    configuration: remoteConfiguration,
    log: message => logStream.write(
      `[${new Date().toISOString()}] ${message}\n`
    )
  })
  globalThis.__unilabWorkbenchRemoteAccessController = remoteAccessController
  if (
    parsed.mode === 'remote'
    || parsed.mode === 'desktop-remote'
    || process.env['UNILAB_REMOTE_AUTOSTART'] === '1'
  ) {
    await remoteAccessController.start()
  }

  process.env['THEIA_WORKSPACE'] = workspace
  process.env['UNILAB_PYTHON_ENV'] = pythonEnvironment
  process.env['UNILAB_DESKTOP_SURFACE'] = 'workbench'
  process.env['UNILAB_DESKTOP_RENDERER_URL'] = rendererUrl
  process.env['UNILAB_AGENT_ICON'] = resources.brandIcon
  process.env['UNILAB_AIONUI_APP'] = '/Applications/AionUi.app'
  process.env['ESBUILD_BINARY_PATH'] = resources.esbuildBinary
  if (osProject) process.env['UNILAB_OS_PROJECT'] = osProject
  else delete process.env['UNILAB_OS_PROJECT']

  await import(pathToFileURL(resources.desktopMain).href)
}

function resolvePackagedResources() {
  const root = process.resourcesPath
  const workbench = path.join(root, 'workbench')
  return {
    workbench,
    backendMain: path.join(workbench, 'lib', 'backend', 'main.js'),
    plugins: path.join(workbench, 'plugins'),
    desktopMain: path.join(root, 'desktop', 'out', 'main', 'index.js'),
    nodeBinary: path.join(root, 'node-runtime', 'bin', 'node'),
    esbuildBinary: path.join(
      root,
      'device-card-builder',
      process.platform === 'win32' ? 'esbuild.exe' : 'esbuild'
    ),
    brandIcon: path.join(root, 'branding', 'icon.png')
  }
}

async function selectWorkspace(candidate) {
  const validCandidate = await validDirectory(candidate)
  if (validCandidate) return validCandidate
  const selection = await dialog.showOpenDialog({
    title: '选择 UniLab 工作区',
    properties: ['openDirectory', 'createDirectory']
  })
  if (selection.canceled || selection.filePaths.length !== 1) {
    throw new Error('未选择工作区。')
  }
  const selected = await validDirectory(selection.filePaths[0])
  if (!selected) throw new Error('选择的工作区不可访问。')
  return selected
}

async function selectPythonEnvironment({ explicit, persisted }) {
  if (explicit) {
    return discoverWorkbenchPythonEnvironment({ selected: explicit })
  }
  if (persisted) {
    try {
      return await discoverWorkbenchPythonEnvironment({ selected: persisted })
    } catch {
      // The environment may have been replaced since the previous launch.
    }
  }
  return discoverWorkbenchPythonEnvironment({ selected: null })
}

async function selectOptionalDirectory(candidate) {
  if (!candidate) return null
  return validDirectory(candidate)
}

async function validDirectory(candidate) {
  if (!candidate || typeof candidate !== 'string') return null
  try {
    const resolved = await realpath(candidate)
    return (await stat(resolved)).isDirectory() ? resolved : null
  } catch {
    return null
  }
}

async function readPersistedConfiguration(configPath) {
  try {
    const value = JSON.parse(await readFile(configPath, 'utf8'))
    if (!value || value.version !== CONFIG_VERSION) return {}
    return {
      workspace: typeof value.workspace === 'string' ? value.workspace : null,
      pythonEnvironment: typeof value.pythonEnvironment === 'string'
        ? value.pythonEnvironment
        : null,
      osProject: typeof value.osProject === 'string' ? value.osProject : null
    }
  } catch {
    return {}
  }
}

async function writePersistedConfiguration(configPath, value) {
  await mkdir(path.dirname(configPath), { recursive: true })
  const temporaryPath = `${configPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600
  })
  const { rename } = await import('node:fs/promises')
  await rename(temporaryPath, configPath)
}

async function findAvailableLoopbackPort(preferredPort) {
  for (let port = preferredPort; port <= Math.min(preferredPort + 20, 65_535); port += 1) {
    if (await canBindLoopback(port)) return port
  }
  throw new Error(`端口 ${preferredPort}-${preferredPort + 20} 均不可用。`)
}

function canBindLoopback(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function waitForWorkbench(rendererUrl, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = '尚未响应'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Theia backend 提前退出，退出码 ${child.exitCode}。`)
    }
    try {
      const response = await fetch(rendererUrl, { redirect: 'manual' })
      if (response.ok || response.status === 302) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(250)
  }
  throw new Error(`Theia backend 在 ${timeoutMs / 1000} 秒内未就绪：${lastError}`)
}

async function stopBackendProcess(child) {
  if (!child?.pid || child.exitCode !== null) return
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    new Promise(resolve => child.once('close', resolve)),
    delay(BACKEND_STOP_TIMEOUT_MS)
  ])
  if (child.exitCode === null) {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}
