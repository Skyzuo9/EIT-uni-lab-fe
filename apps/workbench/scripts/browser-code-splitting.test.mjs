import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createBrowserBuildOptions } from './browser-code-splitting.mjs'

describe('Workbench browser code splitting', () => {
  it('splits application entries while preserving classic worker bundles', () => {
    const copyPlugin = { name: 'plugin:copy' }
    const runtimeAssetsPlugin = { name: 'unilab-workbench-runtime-assets' }
    const sharedPlugin = { name: 'shared-transform' }
    const baseOptions = {
      bundle: true,
      entryPoints: {
        bundle: './frontend/index.js',
        'secondary-window': './frontend/secondary-index.js',
        'editor.worker': './workers/editor.js',
        'plugin-worker': './workers/plugin.js',
      },
      plugins: [sharedPlugin, copyPlugin, runtimeAssetsPlugin],
    }

    const { applicationOptions, workerOptions } = createBrowserBuildOptions(baseOptions)

    assert.deepEqual(applicationOptions.entryPoints, {
      bundle: './frontend/index.js',
      'secondary-window': './frontend/secondary-index.js',
    })
    assert.equal(applicationOptions.format, 'esm')
    assert.equal(applicationOptions.splitting, true)
    assert.equal(applicationOptions.chunkNames, 'chunks/[name]-[hash]')

    assert.deepEqual(workerOptions.entryPoints, {
      'editor.worker': './workers/editor.js',
      'plugin-worker': './workers/plugin.js',
    })
    assert.equal(workerOptions.format, 'iife')
    assert.equal(workerOptions.splitting, false)
    assert.deepEqual(workerOptions.plugins, [sharedPlugin])

    assert.equal(baseOptions.format, undefined)
    assert.equal(baseOptions.splitting, undefined)
    assert.equal(baseOptions.entryPoints.bundle, './frontend/index.js')
  })

  it('fails closed when Theia changes a required browser entry name', () => {
    assert.throws(
      () => createBrowserBuildOptions({
        entryPoints: { bundle: './frontend/index.js' },
        plugins: [],
      }),
      /required browser entry/i,
    )
  })
})
