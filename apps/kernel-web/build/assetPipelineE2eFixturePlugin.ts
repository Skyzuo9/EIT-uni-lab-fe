import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const URL_PREFIX = '/__asset_pipeline_e2e__'
const FIXTURE_RUN_ID = 'asset-pipeline-e2e-20260824'
const PLUGIN_DIR = fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_FIXTURE_ROOT = resolve(
  PLUGIN_DIR,
  '../../../../unilab-workbench-e2e-handoff-20260824/workbench-fixture-baseline'
)
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.log': 'text/plain; charset=utf-8',
  '.sha256': 'text/plain; charset=utf-8'
}

/**
 * 开发/预览时把交接包基线夹具挂到隔离 URL，不把大 GLB 打进 Git 或生产包。
 */
export function assetPipelineE2eFixturePlugin(): Plugin {
  const fixtureRoot = resolve(
    process.env.UNILAB_ASSET_PIPELINE_FIXTURE_ROOT ?? DEFAULT_FIXTURE_ROOT
  )

  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void
  ): void => {
    const pathOnly = request.url?.split('?')[0] ?? ''
    if (!pathOnly.startsWith(`${URL_PREFIX}/`) && pathOnly !== URL_PREFIX) {
      next()
      return
    }
    response.setHeader('Cache-Control', 'no-store')
    if (!existsSync(fixtureRoot)) {
      response.statusCode = 404
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.end(`Asset pipeline fixture is missing: ${fixtureRoot}`)
      return
    }
    const rest = decodeURIComponent(pathOnly.slice(URL_PREFIX.length)).replace(
      /^\/+/,
      ''
    )
    const runPrefix = `${FIXTURE_RUN_ID}/`
    if (!rest.startsWith(runPrefix)) {
      response.statusCode = 404
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.end(`Missing fixture file: ${rest || '(root)'}`)
      return
    }
    const relative = rest.slice(runPrefix.length)
    if (!relative || relative.split(/[\\/]/).includes('..')) {
      response.statusCode = 400
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.end('Invalid fixture path')
      return
    }
    const filePath = resolve(fixtureRoot, relative)
    const rootWithSep = fixtureRoot.endsWith(sep) ? fixtureRoot : `${fixtureRoot}${sep}`
    if (filePath !== fixtureRoot && !filePath.startsWith(rootWithSep)) {
      response.statusCode = 400
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.end('Invalid fixture path')
      return
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.statusCode = 404
      response.setHeader('Content-Type', 'text/plain; charset=utf-8')
      response.end(`Missing fixture file: ${relative}`)
      return
    }
    const mime = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    response.statusCode = 200
    response.setHeader('Content-Type', mime)
    response.setHeader('Cache-Control', 'no-store')
    createReadStream(filePath).pipe(response)
  }

  return {
    name: 'unilab-asset-pipeline-e2e-fixture',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    }
  }
}

export function assetPipelineE2eFixtureRoot(): string {
  return resolve(process.env.UNILAB_ASSET_PIPELINE_FIXTURE_ROOT ?? DEFAULT_FIXTURE_ROOT)
}
