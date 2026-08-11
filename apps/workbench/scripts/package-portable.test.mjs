import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
  PORTABLE_NODE_ARCHIVES,
  PORTABLE_NODE_VERSION
} from './package-portable.mjs'

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
})
