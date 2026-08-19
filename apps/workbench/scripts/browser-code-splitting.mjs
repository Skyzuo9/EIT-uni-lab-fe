import { readFile } from 'node:fs/promises'

const APPLICATION_ENTRY_NAMES = ['bundle', 'secondary-window']
const WORKER_ENTRY_NAMES = ['editor.worker', 'plugin-worker']
const THEIA_FRONTEND_MODULE_LOAD = 'container.load(containerModule.default)'
const SPLIT_FRONTEND_MODULE_LOAD =
  'container.load(containerModule.default?.default ?? containerModule.default)'
const APPLICATION_ONLY_PLUGIN_NAMES = new Set([
  'plugin:copy',
  'sass-plugin',
  'unilab-workbench-chunk-cleanup',
  'unilab-workbench-runtime-assets',
])

function selectEntries(entryPoints, names) {
  return Object.fromEntries(names.map(name => [name, entryPoints[name]]))
}

export function normalizeTheiaFrontendModuleLoad(source) {
  if (!source.includes(THEIA_FRONTEND_MODULE_LOAD)) {
    throw new Error('Theia frontend module loader contract is unavailable')
  }
  return source.replaceAll(THEIA_FRONTEND_MODULE_LOAD, SPLIT_FRONTEND_MODULE_LOAD)
}

function commonJsDynamicImportInteropPlugin() {
  return {
    name: 'unilab-theia-split-module-interop',
    setup(build) {
      build.onLoad(
        { filter: /src-gen[\\/]frontend[\\/]index\.js$/ },
        async ({ path }) => ({
          contents: normalizeTheiaFrontendModuleLoad(await readFile(path, 'utf8')),
          loader: 'js',
        }),
      )
    },
  }
}

/**
 * Split the browser application without turning Theia's classic plugin worker
 * into an ESM worker. The entry names are a fail-closed contract with Theia's
 * generated browser configuration.
 */
export function createBrowserBuildOptions(baseOptions) {
  const entryPoints = baseOptions.entryPoints
  if (!entryPoints || Array.isArray(entryPoints)) {
    throw new Error('Theia required browser entry map is unavailable')
  }

  const requiredNames = [...APPLICATION_ENTRY_NAMES, ...WORKER_ENTRY_NAMES]
  const missingNames = requiredNames.filter(name => !entryPoints[name])
  if (missingNames.length > 0) {
    throw new Error(`Theia required browser entry is missing: ${missingNames.join(', ')}`)
  }

  const plugins = baseOptions.plugins ?? []
  return {
    applicationOptions: {
      ...baseOptions,
      entryPoints: selectEntries(entryPoints, APPLICATION_ENTRY_NAMES),
      format: 'esm',
      splitting: true,
      chunkNames: 'chunks/[name]-[hash]',
      plugins: [...plugins, commonJsDynamicImportInteropPlugin()],
    },
    workerOptions: {
      ...baseOptions,
      entryPoints: selectEntries(entryPoints, WORKER_ENTRY_NAMES),
      format: 'iife',
      splitting: false,
      plugins: plugins.filter(plugin => !APPLICATION_ONLY_PLUGIN_NAMES.has(plugin.name)),
    },
  }
}
