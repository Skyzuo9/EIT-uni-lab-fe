import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
  assertMacosSigningEnvironment,
  NODE_RUNTIME_SHA256,
  NODE_RUNTIME_VERSION
} from './package-macos.mjs'

describe('Workbench macOS distribution gate', () => {
  it('never silently downgrades the formal release to unsigned', () => {
    assert.throws(
      () => assertMacosSigningEnvironment({}),
      /CSC_LINK.*APPLE_TEAM_ID/
    )
  })

  it('accepts the complete electron-builder signing contract', () => {
    assert.doesNotThrow(() => assertMacosSigningEnvironment({
      CSC_LINK: '/secure/developer-id.p12',
      CSC_KEY_PASSWORD: 'redacted',
      APPLE_ID: 'release@example.com',
      APPLE_APP_SPECIFIC_PASSWORD: 'redacted',
      APPLE_TEAM_ID: 'TEAM123'
    }))
  })

  it('pins the portable backend runtime and its supply-chain digest', () => {
    assert.equal(NODE_RUNTIME_VERSION, '24.14.0')
    assert.match(NODE_RUNTIME_SHA256, /^[a-f0-9]{64}$/u)
  })

  it('ships the desktop Workspace welcome surface inside the application', async () => {
    const builderConfiguration = await readFile(
      new URL('../electron-builder.yml', import.meta.url),
      'utf8'
    )

    assert.match(builderConfiguration, /desktop\/welcome\.html/u)
    assert.match(builderConfiguration, /desktop\/welcome\.css/u)
    assert.match(builderConfiguration, /desktop\/welcome\.js/u)
  })
})
