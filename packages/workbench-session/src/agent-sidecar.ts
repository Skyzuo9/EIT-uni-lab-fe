import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import {
  createServer as createHttpServer,
  request as requestHttp,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import { createRequire } from 'node:module'
import net from 'node:net'
import { dirname, extname, join, resolve, sep } from 'node:path'
import * as asar from '@electron/asar'

export interface WorkbenchAgentIdentity {
  implementation: 'aioncore'
  productName: 'UniLab Agent'
  distributionVersion: string
  phase: 'ready' | 'failed'
  url: string | null
  iconUrl: string | null
  pid: number | null
  dataDir: string
  workDir: string
  logPath: string
  diagnostic: string | null
}

export interface ManagedWorkbenchAgent {
  identity: WorkbenchAgentIdentity
  stop(): Promise<void>
}

export interface ManagedWorkbenchAgentOptions {
  workspacePath: string
  editablePackagePath: string
  environment?: NodeJS.ProcessEnv
  appPath?: string
  brandIconPath?: string
  readinessTimeoutMs?: number
  onUnexpectedExit?: (message: string) => void
}

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
])
export const PINNED_AIONUI_VERSION = '2.1.52'

/** Start the pinned local Agent implementation for one exact Editable Package. */
export async function startManagedWorkbenchAgent(
  options: ManagedWorkbenchAgentOptions
): Promise<ManagedWorkbenchAgent> {
  const environment = options.environment ?? process.env
  const appPath = options.appPath ?? environment['UNILAB_AIONUI_APP'] ??
    '/Applications/AionUi.app'
  const resources = join(appPath, 'Contents', 'Resources')
  const architecture = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  const corePath = environment['UNILAB_AIONCORE_PATH'] ?? join(
    resources,
    'bundled-aioncore',
    architecture,
    'aioncore'
  )
  const asarPath = environment['UNILAB_AIONUI_ASAR'] ?? join(resources, 'app.asar')
  if (!existsSync(corePath) || !existsSync(asarPath)) {
    throw new Error(`UniLab Agent implementation is unavailable under ${appPath}`)
  }
  const distributionVersion = readDistributionVersion(asarPath)
  const expectedVersion = environment['UNILAB_AIONUI_VERSION'] ??
    PINNED_AIONUI_VERSION
  if (distributionVersion !== expectedVersion) {
    throw new Error(
      `UniLab Agent requires AionUi ${expectedVersion}; found ${distributionVersion}`
    )
  }
  const dataDir = join(options.workspacePath, '.unilabos', 'agent', 'aionui')
  const selectedBrandIcon = options.brandIconPath ??
    environment['UNILAB_AGENT_ICON']
  const brandIconPath = selectedBrandIcon && existsSync(selectedBrandIcon)
    ? selectedBrandIcon
    : undefined
  const logPath = join(dataDir, 'logs', 'aioncore.log')
  await mkdir(dirname(logPath), { recursive: true })
  const rendererDir = await prepareRenderer(asarPath, dataDir)
  const backendPort = await availablePort()
  let publicPort = await availablePort()
  while (publicPort === backendPort) publicPort = await availablePort()
  const log = createWriteStream(logPath, { flags: 'a' })
  const child = spawn(corePath, [
    '--host', '127.0.0.1',
    '--port', String(backendPort),
    '--data-dir', dataDir,
    '--log-dir', dirname(logPath),
    '--work-dir', options.editablePackagePath,
    '--app-version', distributionVersion,
    '--managed-resources-mode', 'bundled',
    '--local',
    '--identity-mode', 'local'
  ], {
    cwd: options.editablePackagePath,
    env: {
      ...environment,
      AIONUI_CACHE_DIR: join(dataDir, 'cache'),
      AIONUI_WORK_DIR: options.editablePackagePath,
      AIONUI_LOG_DIR: dirname(logPath)
    },
    detached: process.platform !== 'win32',
    shell: false,
    windowsHide: true
  })
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  let expectedExit = false
  child.once('close', (code, signal) => {
    log.end(`[workbench-agent] exited code=${String(code)} signal=${String(signal)}\n`)
    if (!expectedExit) options.onUnexpectedExit?.(
      `UniLab Agent exited unexpectedly (code=${String(code)}, signal=${String(signal)})`
    )
  })
  try {
    await waitForHealth(child, backendPort, options.readinessTimeoutMs ?? 60_000)
    sanitizeLocalIdentityDatabase(dataDir)
    const server = await startRendererProxy({
      backendPort,
      publicPort,
      rendererDir,
      workspacePath: options.workspacePath,
      editablePackagePath: options.editablePackagePath,
      brandIconPath
    })
    const identity: WorkbenchAgentIdentity = {
      implementation: 'aioncore',
      productName: 'UniLab Agent',
      distributionVersion,
      phase: 'ready',
      url: `http://127.0.0.1:${publicPort}`,
      iconUrl: brandIconPath
        ? `http://127.0.0.1:${publicPort}/__unilab/icon.png`
        : null,
      pid: child.pid ?? null,
      dataDir,
      workDir: options.editablePackagePath,
      logPath,
      diagnostic: null
    }
    return {
      identity,
      stop: async () => {
        expectedExit = true
        await closeServer(server)
        await stopChild(child)
      }
    }
  } catch (error) {
    expectedExit = true
    await stopChild(child)
    throw error
  }
}

function readDistributionVersion(archive: string): string {
  let manifest: unknown
  try {
    manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
  } catch (error) {
    throw new Error('UniLab Agent distribution manifest is invalid', {
      cause: error
    })
  }
  if (!isRecord(manifest) || typeof manifest['version'] !== 'string' ||
    !manifest['version'].trim()) {
    throw new Error('UniLab Agent distribution version is missing')
  }
  return manifest['version'].trim()
}

/** Local identity disables auth; remove unused upstream credential material. */
function sanitizeLocalIdentityDatabase(dataDir: string): void {
  const requireBuiltin = createRequire(join(process.cwd(), 'package.json'))
  const { DatabaseSync } = requireBuiltin('node:sqlite') as {
    DatabaseSync: new (path: string) => {
      exec(sql: string): void
      prepare(sql: string): { get(): unknown }
      close(): void
    }
  }
  const database = new DatabaseSync(join(dataDir, 'aionui-backend.db'))
  try {
    database.exec(`
      UPDATE users SET password_hash = '', jwt_secret = NULL;
      DELETE FROM oauth_tokens;
    `)
    const userSecrets = database.prepare(
      'SELECT count(*) AS count FROM users '
      + "WHERE coalesce(password_hash, '') <> '' OR jwt_secret IS NOT NULL"
    ).get() as { count: number | bigint }
    const oauthTokens = database.prepare(
      'SELECT count(*) AS count FROM oauth_tokens'
    ).get() as { count: number | bigint }
    if (Number(userSecrets.count) !== 0 || Number(oauthTokens.count) !== 0) {
      throw new Error('UniLab Agent local identity retained SQLite credentials')
    }
  } finally {
    database.close()
  }
}

/** Ordinary renderer file APIs can never address Workbench private state. */
export function isProtectedAgentRequest(url: string, body = ''): boolean {
  const candidates = [url, body]
  try { candidates.push(JSON.stringify(JSON.parse(body))) } catch { /* not JSON */ }
  for (let index = 0; index < candidates.length; index += 1) {
    let decoded = candidates[index] ?? ''
    for (let pass = 0; pass < 3; pass += 1) {
      try {
        const next = decodeURIComponent(decoded)
        if (next === decoded) break
        decoded = next
      } catch { break }
    }
    const normalized = decoded.replaceAll('\\', '/').toLowerCase()
    if (/(^|[^a-z0-9_-])\.unilabos([^a-z0-9_-]|$)/.test(normalized)) {
      return true
    }
  }
  return false
}

async function prepareRenderer(archive: string, dataDir: string): Promise<string> {
  const archiveStat = await stat(archive)
  const cacheKey = createHash('sha256')
    .update(`${archiveStat.size}:${archiveStat.mtimeMs}`)
    .digest('hex').slice(0, 16)
  const rendererDir = join(dataDir, 'renderer-cache', cacheKey)
  const marker = join(rendererDir, '.ready')
  if (existsSync(marker) && existsSync(join(rendererDir, 'index.html'))) {
    return rendererDir
  }
  await mkdir(rendererDir, { recursive: true })
  const prefix = '/out/renderer/'
  for (const entry of asar.listPackage(archive, { isPack: false })) {
    if (!entry.startsWith(prefix)) continue
    const relativePath = entry.slice(prefix.length)
    if (!relativePath) continue
    const target = resolve(rendererDir, relativePath)
    if (!target.startsWith(`${rendererDir}${sep}`)) continue
    const info = asar.statFile(archive, entry.slice(1))
    if ('files' in info) await mkdir(target, { recursive: true })
    else {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, asar.extractFile(archive, entry.slice(1)))
    }
  }
  await writeFile(marker, 'unilab-agent-renderer/v1\n', { mode: 0o600 })
  return rendererDir
}

async function startRendererProxy(options: {
  backendPort: number
  publicPort: number
  rendererDir: string
  workspacePath: string
  editablePackagePath: string
  brandIconPath?: string
}): Promise<Server> {
  const server = createHttpServer((request, response) => {
    void routeRequest(request, response, options).catch(error => {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    })
  })
  server.on('upgrade', (request, socket, head) => {
    if (isProtectedAgentRequest(request.url ?? '')) return socket.destroy()
    const upstream = net.connect(options.backendPort, '127.0.0.1', () => {
      const headers: string[] = []
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index] ?? ''
        const value = name.toLowerCase() === 'host'
          ? `127.0.0.1:${options.backendPort}`
          : request.rawHeaders[index + 1] ?? ''
        headers.push(`${name}: ${value}`)
      }
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`)
      if (head.length) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    const close = () => { upstream.destroy(); socket.destroy() }
    upstream.on('error', close)
    socket.on('error', close)
  })
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(options.publicPort, '127.0.0.1', () => {
      server.off('error', reject)
      resolveListen()
    })
  })
  return server
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    backendPort: number
    rendererDir: string
    workspacePath: string
    editablePackagePath: string
    brandIconPath?: string
  }
): Promise<void> {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname === '/__unilab/status') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      productName: 'UniLab Agent',
      implementation: 'aioncore',
      workspacePath: options.workspacePath,
      workDir: options.editablePackagePath,
      privateStateProtected: true
    }))
    return
  }
  if (pathname === '/__unilab/branding.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(brandingScript())
    return
  }
  if (pathname === '/__unilab/icon.png' && options.brandIconPath &&
    existsSync(options.brandIconPath)) {
    const iconStat = await stat(options.brandIconPath)
    response.writeHead(200, {
      'content-type': 'image/png',
      'content-length': iconStat.size,
      'cache-control': 'public, max-age=86400'
    })
    createReadStream(options.brandIconPath).pipe(response)
    return
  }
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/') ||
    pathname === '/login' || pathname === '/logout') {
    const body = await readRequestBody(request)
    if (isProtectedAgentRequest(request.url ?? '', body.toString('utf8'))) {
      response.writeHead(403, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'Workbench private state is protected' }))
      return
    }
    proxyRequest(request, response, options.backendPort, body)
    return
  }
  await serveStatic(request, response, {
    rendererDir: options.rendererDir,
    pathname,
    brandIconPath: options.brandIconPath
  })
}

async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    rendererDir: string
    pathname: string
    brandIconPath?: string
  }
): Promise<void> {
  const requested = options.pathname === '/' ? '/index.html' : options.pathname
  let target = resolve(options.rendererDir, `.${requested}`)
  if (!target.startsWith(`${options.rendererDir}${sep}`) || !existsSync(target) ||
    !(await stat(target)).isFile()) {
    target = join(options.rendererDir, 'index.html')
  }
  if (target.endsWith('index.html')) {
    const html = await readFile(target, 'utf8')
    const branded = html.replaceAll('AionUi', 'UniLab Agent').replace(
      '</head>',
      `${options.brandIconPath
        ? '<link rel="icon" type="image/png" href="/__unilab/icon.png">'
        : ''}<script defer src="/__unilab/branding.js"></script></head>`
    )
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    })
    response.end(branded)
    return
  }
  const fileStat = await stat(target)
  response.writeHead(200, {
    'content-type': MIME_TYPES.get(extname(target).toLowerCase()) ??
      'application/octet-stream',
    'content-length': fileStat.size,
    'cache-control': 'public, max-age=31536000, immutable'
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(target).pipe(response)
}

function brandingScript(): string {
  return `(() => {
    const brand = () => {
      document.title = 'UniLab Agent'
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeValue && /Aion\s*Ui/i.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(/Aion\s*Ui/gi, 'UniLab Agent')
        }
      }
    }
    new MutationObserver(brand).observe(document.documentElement, { childList: true, subtree: true })
    addEventListener('DOMContentLoaded', brand)
    brand()
  })()`
}

function proxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  backendPort: number,
  body: Buffer
): void {
  const headers = { ...request.headers, host: `127.0.0.1:${backendPort}` }
  delete headers['content-length']
  const upstream = requestHttp({
    hostname: '127.0.0.1',
    port: backendPort,
    path: request.url,
    method: request.method,
    headers: { ...headers, 'content-length': String(body.length) }
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', error => {
    response.writeHead(502, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: error.message }))
  })
  upstream.end(body)
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 8 * 1024 * 1024) throw new Error('Agent request body is too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function waitForHealth(
  child: ChildProcessWithoutNullStreams,
  port: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('UniLab Agent exited before readiness')
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1_000)
      })
      if (response.ok) return
    } catch { /* still starting */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200))
  }
  throw new Error('UniLab Agent readiness timed out')
}

async function availablePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No loopback port')
  await closeServer(server)
  return address.port
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  } catch { child.kill('SIGTERM') }
  const stopped = await Promise.race([
    new Promise<void>(resolveExit => child.once('close', () => resolveExit())),
    new Promise<'timeout'>(resolveDelay => setTimeout(
      () => resolveDelay('timeout'),
      5_000
    ))
  ])
  if (stopped !== 'timeout' || child.exitCode !== null ||
    child.signalCode !== null) return
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
    else child.kill('SIGKILL')
  } catch { child.kill('SIGKILL') }
  await new Promise<void>(resolveExit => {
    if (child.exitCode !== null || child.signalCode !== null) resolveExit()
    else child.once('close', () => resolveExit())
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function closeServer(server: Server | net.Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolveClose, reject) => server.close(error => (
    error ? reject(error) : resolveClose()
  )))
}
