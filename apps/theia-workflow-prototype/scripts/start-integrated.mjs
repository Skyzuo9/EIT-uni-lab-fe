import { spawn } from 'node:child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createServer, request as requestHttp } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { extractFile, listPackage, statFile } = require('@electron/asar')

const AIONUI_APP = process.env.AIONUI_APP ?? '/Applications/AionUi.app'
const AIONUI_RESOURCES = path.join(AIONUI_APP, 'Contents', 'Resources')
const AIONUI_ASAR = path.join(AIONUI_RESOURCES, 'app.asar')
const AIONUI_CORE = path.join(
  AIONUI_RESOURCES,
  'bundled-aioncore',
  'darwin-arm64',
  'aioncore'
)
const AIONUI_VERSION = process.env.AIONUI_VERSION ?? '2.1.52'
const AIONUI_PORT = Number(process.env.AIONUI_PORT ?? 25808)
const AIONUI_BACKEND_PORT = Number(process.env.AIONUI_BACKEND_PORT ?? 26081)
const THEIA_PORT = Number(process.env.THEIA_PORT ?? 3100)
const workspace = path.resolve(process.env.THEIA_WORKSPACE ?? '../..')
const dataDir = path.resolve(
  process.env.AIONUI_DATA_DIR ?? path.join(homedir(), '.aionui-theia-prototype')
)
const cacheDir = path.join(dataDir, 'cache')
const logDir = path.join(dataDir, 'logs')

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
])

function assertLocalPort(value, label) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${label} must be an integer between 1024 and 65535`)
  }
}

function prepareRenderer() {
  if (!existsSync(AIONUI_ASAR)) {
    throw new Error(`AionUi is not installed at ${AIONUI_APP}`)
  }
  const archive = statSync(AIONUI_ASAR)
  const cacheKey = `${archive.size}-${Math.trunc(archive.mtimeMs)}`
  const rendererDir = path.join(tmpdir(), `unilab-aionui-renderer-${cacheKey}`)
  const marker = path.join(rendererDir, '.ready')
  if (existsSync(marker) && existsSync(path.join(rendererDir, 'index.html'))) {
    return rendererDir
  }

  mkdirSync(rendererDir, { recursive: true })
  const prefix = '/out/renderer/'
  for (const entry of listPackage(AIONUI_ASAR, { isPack: false })) {
    if (!entry.startsWith(prefix)) continue
    const relative = entry.slice(prefix.length)
    if (!relative) continue
    const target = path.join(rendererDir, relative)
    const info = statFile(AIONUI_ASAR, entry.slice(1))
    if ('files' in info) {
      mkdirSync(target, { recursive: true })
      continue
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, extractFile(AIONUI_ASAR, entry.slice(1)))
  }
  writeFileSync(marker, `${AIONUI_VERSION}\n`)
  return rendererDir
}

function prioritizeAgentCliPath() {
  const preferred = [
    '/Applications/ChatGPT.app/Contents/Resources',
    path.join(homedir(), '.local', 'bin')
  ]
  const current = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  return [...new Set([...preferred, ...current])].join(path.delimiter)
}

function spawnAionCore() {
  if (!existsSync(AIONUI_CORE)) {
    throw new Error(`AionUi backend is missing at ${AIONUI_CORE}`)
  }
  mkdirSync(cacheDir, { recursive: true })
  mkdirSync(logDir, { recursive: true })
  const child = spawn(AIONUI_CORE, [
    '--host', '127.0.0.1',
    '--port', String(AIONUI_BACKEND_PORT),
    '--data-dir', dataDir,
    '--log-dir', logDir,
    '--work-dir', workspace,
    '--app-version', AIONUI_VERSION,
    '--managed-resources-mode', 'bundled',
    '--local',
    '--identity-mode', 'local'
  ], {
    cwd: workspace,
    env: {
      ...process.env,
      PATH: prioritizeAgentCliPath(),
      AIONUI_CACHE_DIR: cacheDir,
      AIONUI_WORK_DIR: workspace,
      AIONUI_LOG_DIR: logDir
    },
    stdio: ['ignore', 'inherit', 'inherit']
  })
  return child
}

async function waitForBackend(child) {
  let exited = false
  child.once('exit', () => {
    exited = true
  })
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (exited) throw new Error('AionUi backend exited before becoming ready')
    try {
      const response = await fetch(`http://127.0.0.1:${AIONUI_BACKEND_PORT}/health`)
      if (response.ok) return
    } catch {
      // Backend is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for the AionUi backend')
}

async function createLocalSessionCredentials() {
  const response = await fetch(
    `http://127.0.0.1:${AIONUI_BACKEND_PORT}/api/webui/reset-password`,
    { method: 'POST' }
  )
  if (!response.ok) {
    throw new Error(`AionUi local session setup failed (${response.status})`)
  }
  const payload = await response.json()
  const password = payload?.data?.new_password
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('AionUi local session setup returned no credential')
  }
  const userResponse = await fetch(
    `http://127.0.0.1:${AIONUI_BACKEND_PORT}/api/auth/internal/users/system`
  )
  const userPayload = userResponse.ok ? await userResponse.json() : null
  const username = userPayload?.data?.username || 'admin'
  return { username, password }
}

function proxyRequest(request, response) {
  const upstream = requestHttp({
    hostname: '127.0.0.1',
    port: AIONUI_BACKEND_PORT,
    path: request.url,
    method: request.method,
    headers: {
      ...request.headers,
      host: `127.0.0.1:${AIONUI_BACKEND_PORT}`
    }
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', error => {
    response.writeHead(502, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: error.message }))
  })
  request.pipe(upstream)
}

async function establishBrowserSession(response, credentials) {
  const loginResponse = await fetch(`http://127.0.0.1:${AIONUI_BACKEND_PORT}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...credentials, remember: true })
  })
  if (!loginResponse.ok) {
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`AionUi session bootstrap failed (${loginResponse.status})`)
    return
  }
  const cookies = loginResponse.headers.getSetCookie?.() ?? []
  response.writeHead(302, {
    location: '/guid',
    ...(cookies.length > 0 ? { 'set-cookie': cookies } : {})
  })
  response.end()
}

function serveStatic(request, response, rendererDir) {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  let target = path.resolve(rendererDir, `.${requestedPath}`)
  if (!target.startsWith(`${rendererDir}${path.sep}`) || !existsSync(target) || !statSync(target).isFile()) {
    target = path.join(rendererDir, 'index.html')
  }
  const stat = statSync(target)
  response.writeHead(200, {
    'content-type': MIME_TYPES.get(path.extname(target).toLowerCase()) ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': target.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable'
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(target).pipe(response)
}

async function startAionUiServer(rendererDir, credentials) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (pathname === '/__unilab/session') {
      void establishBrowserSession(response, credentials).catch(error => {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        response.end(error instanceof Error ? error.message : String(error))
      })
      return
    }
    if (pathname === '/__unilab/status') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ready: true, workspace }))
      return
    }
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/auth/') ||
      pathname === '/login' ||
      pathname === '/logout'
    ) {
      proxyRequest(request, response)
      return
    }
    serveStatic(request, response, rendererDir)
  })

  server.on('upgrade', (request, socket, head) => {
    const upstream = net.connect(AIONUI_BACKEND_PORT, '127.0.0.1', () => {
      const headers = []
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index]
        const value = name.toLowerCase() === 'host'
          ? `127.0.0.1:${AIONUI_BACKEND_PORT}`
          : request.rawHeaders[index + 1]
        headers.push(`${name}: ${value}`)
      }
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`)
      if (head.length > 0) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    const close = () => {
      upstream.destroy()
      socket.destroy()
    }
    upstream.on('error', close)
    socket.on('error', close)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(AIONUI_PORT, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server
}

function spawnTheia() {
  return spawn('theia', [
    'start',
    workspace,
    '--hostname', '127.0.0.1',
    '--port', String(THEIA_PORT),
    '--plugins=local-dir:plugins'
  ], {
    stdio: 'inherit',
    env: process.env
  })
}

async function main() {
  assertLocalPort(AIONUI_PORT, 'AIONUI_PORT')
  assertLocalPort(AIONUI_BACKEND_PORT, 'AIONUI_BACKEND_PORT')
  assertLocalPort(THEIA_PORT, 'THEIA_PORT')
  if (!existsSync(workspace)) throw new Error(`Workspace does not exist: ${workspace}`)

  console.log(`[Uni-Lab] workspace: ${workspace}`)
  console.log('[Uni-Lab] preparing AionUi renderer…')
  const rendererDir = prepareRenderer()
  const aionCore = spawnAionCore()
  await waitForBackend(aionCore)
  const credentials = await createLocalSessionCredentials()
  const aionUiServer = await startAionUiServer(rendererDir, credentials)
  console.log(`[Uni-Lab] AionUi: http://127.0.0.1:${AIONUI_PORT} (local only)`)
  console.log(`[Uni-Lab] Theia:  http://127.0.0.1:${THEIA_PORT}`)

  const theia = spawnTheia()
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    aionUiServer.close()
    if (!theia.killed) theia.kill('SIGTERM')
    if (!aionCore.killed) aionCore.kill('SIGTERM')
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  aionCore.once('exit', code => {
    if (!stopping) {
      console.error(`[Uni-Lab] AionUi backend exited unexpectedly (${code ?? 'signal'})`)
      stop()
      process.exitCode = 1
    }
  })
  theia.once('exit', code => {
    stop()
    process.exitCode = code ?? 0
  })
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
