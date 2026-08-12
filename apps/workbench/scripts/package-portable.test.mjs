import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  PORTABLE_NODE_ARCHIVES,
  PORTABLE_NODE_VERSION
} from './package-portable.mjs'
import {
  MAX_PRODUCTION_LIB_BYTES,
  prepareProductionOutput
} from './prune-production-output.mjs'

describe('portable Workbench packaging contract', () => {
  it('pins native Node runtimes for Linux and Windows', () => {
    assert.equal(PORTABLE_NODE_VERSION, '24.14.0')
    assert.deepEqual(Object.keys(PORTABLE_NODE_ARCHIVES), [
      'linux-64',
      'win-64'
    ])
    for (const descriptor of Object.values(PORTABLE_NODE_ARCHIVES)) {
      assert.match(descriptor.sha256, /^[a-f0-9]{64}$/u)
      assert.equal(descriptor.hostArchitecture, 'x64')
    }
  })

  it('does not make portable packaging depend on pnpm metadata already being cached', async () => {
    const packagingScript = await readFile(
      new URL('./package-portable.mjs', import.meta.url),
      'utf8'
    )

    assert.match(packagingScript, /'--prefer-offline'/u)
    assert.doesNotMatch(packagingScript, /\n\s*'--offline',?\n/u)
  })

  it('builds every installer from a bounded production Workbench bundle', async () => {
    const packageManifest = JSON.parse(await readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    ))
    const builderConfiguration = await readFile(
      new URL('../electron-builder.yml', import.meta.url),
      'utf8'
    )

    assert.match(
      packageManifest.scripts['build:production'],
      /theia build --mode production/u
    )
    assert.match(
      packageManifest.scripts['build:production'],
      /prune-production-output\.mjs/u
    )
    for (const name of [
      'package:mac',
      'package:mac:developer-id',
      'package:mac:adhoc',
      'package:mac:unsigned',
      'package:linux',
      'package:win'
    ]) {
      assert.match(
        packageManifest.scripts[name],
        /^pnpm build:desktop:production/u
      )
    }
    assert.match(builderConfiguration, /^compression: maximum$/mu)
    assert.equal(
      packageManifest.optionalDependencies['@vscode/windows-ca-certs'],
      '0.3.4'
    )
    assert.match(
      builderConfiguration,
      /from: plugins[\s\S]*?filter:[\s\S]*?'!\*\*\/\*\.map'/u
    )
    assert.match(
      builderConfiguration,
      /from: \.packaging\/desktop-runtime\/node_modules[^]*?'!\*\*\/\*\.map'/u
    )
  })

  it('removes source maps and rejects an oversized production lib', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-workbench-lib-'))
    try {
      await mkdir(join(root, 'frontend'), { recursive: true })
      await writeFile(join(root, 'frontend', 'bundle.js'), 'runtime')
      await writeFile(join(root, 'frontend', 'bundle.js.map'), 'debug-only')

      assert.deepEqual(await prepareProductionOutput(root), {
        removedBytes: 10,
        packagedBytes: 7
      })
      await assert.rejects(
        prepareProductionOutput(root, 6),
        /production lib 超出/u
      )
      assert.equal(MAX_PRODUCTION_LIB_BYTES, 90 * 1024 * 1024)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('builds the Windows installer on a native GitHub Actions runner', async () => {
    const workflow = await readFile(
      new URL('../../../.github/workflows/package-windows.yml', import.meta.url),
      'utf8'
    )

    assert.match(workflow, /runs-on: windows-2022/u)
    assert.match(
      workflow,
      /ref: b09c0c048f6de1e5027deb1733da439598c577cf/u
    )
    assert.match(workflow, /Test-Path \.conda\/constructor\/construct\.yaml/u)
    assert.match(
      workflow,
      /conda run -n constructor-build constructor/u
    )
    assert.match(workflow, /pnpm --filter @unilab\/workbench package:win/u)
    assert.match(workflow, /UNILAB_RUNTIME_INSTALLER=/u)
    assert.match(workflow, /UNILAB_AGENT_DISTRIBUTION=/u)
    assert.match(workflow, /actions\/upload-artifact@v6/u)
  })
})
