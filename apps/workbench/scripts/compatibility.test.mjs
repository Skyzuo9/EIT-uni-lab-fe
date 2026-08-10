import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const workbenchDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const repositoryDirectory = path.resolve(workbenchDirectory, '../..')
const compatibility = JSON.parse(await readFile(
  path.join(workbenchDirectory, 'compatibility.json'),
  'utf8'
))
const workbenchPackage = JSON.parse(await readFile(
  path.join(workbenchDirectory, 'package.json'),
  'utf8'
))
const desktopPackage = JSON.parse(await readFile(
  path.join(repositoryDirectory, 'apps', 'desktop', 'package.json'),
  'utf8'
))
const stateSource = await readFile(
  path.join(
    repositoryDirectory,
    'packages',
    'workbench-session',
    'src',
    'workbench-state.ts'
  ),
  'utf8'
)

describe('Workbench compatibility matrix', () => {
  it('matches the versions embedded in the desktop distribution', () => {
    assert.equal(compatibility.product.version, workbenchPackage.version)
    assert.equal(
      compatibility.components.electron,
      workbenchPackage.devDependencies.electron
    )
    assert.equal(
      compatibility.components.theia,
      workbenchPackage.dependencies['@theia/core']
    )
    const sharedDesktopMajor = desktopPackage.devDependencies.electron
      .match(/^(?:\^)?(\d+)\./u)?.[1]
    assert.equal(
      sharedDesktopMajor,
      compatibility.components.electron.split('.')[0]
    )
  })

  it('keeps state schema and host adapter contracts explicit', () => {
    assert.match(
      stateSource,
      new RegExp(
        `WORKBENCH_STATE_SCHEMA_VERSION = ${compatibility.product.stateSchemaVersion}\\b`,
        'u'
      )
    )
    assert.equal(compatibility.contracts.workflowIdeHostAdapter, 1)
    assert.deepEqual(
      compatibility.contracts.osRuntime,
      ['installed-environment', 'source-checkout']
    )
  })

  it('supports arm64 while leaving x64 visibly unverified', () => {
    assert.deepEqual(compatibility.platforms['darwin-arm64'], {
      status: 'supported',
      minimumVersion: '13.0'
    })
    assert.equal(compatibility.platforms['darwin-x64'].status, 'unverified')
    for (const commit of Object.values(compatibility.acceptedBaselines)) {
      assert.match(commit, /^[a-f0-9]{40}$/u)
    }
  })
})
