import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { removePackagedDesktopSelfLink } from '../../desktop/scripts/after-pack.mjs'
import {
  assertMacosSigningEnvironment,
  NODE_RUNTIME_SHA256,
  NODE_RUNTIME_VERSION
} from './package-macos.mjs'

describe('Workbench macOS distribution gate', () => {
  it('publishes the formal UniLab Workbench identity at version 0.1.0', async () => {
    const packageManifest = JSON.parse(await readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    ))
    const theiaManifest = JSON.parse(await readFile(
      new URL('../../../packages/workbench-theia/package.json', import.meta.url),
      'utf8'
    ))
    const builderConfiguration = await readFile(
      new URL('../electron-builder.yml', import.meta.url),
      'utf8'
    )
    const welcomeDocument = await readFile(
      new URL('../desktop/welcome.html', import.meta.url),
      'utf8'
    )

    assert.equal(packageManifest.version, '0.1.0')
    assert.match(packageManifest.description, /UniLab 调试工作台/u)
    assert.match(builderConfiguration, /^productName: UniLab Workbench$/mu)
    assert.match(welcomeDocument, /<title>UniLab 调试工作台<\/title>/u)
    assert.equal(
      theiaManifest.theiaExtensions[0].frontend,
      'lib/browser/unilab-workbench-frontend-module'
    )
    assert.doesNotMatch(JSON.stringify(theiaManifest), /prototype/iu)
  })

  it('never silently downgrades the formal release to unsigned', () => {
    assert.throws(
      () => assertMacosSigningEnvironment({}),
      /CSC_LINK.*APPLE_TEAM_ID/
    )
  })

  it('keeps the temporary ad-hoc acceptance build separate from formal release', async () => {
    const packageManifest = JSON.parse(await readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    ))

    assert.match(packageManifest.scripts['package:mac'], /--signed$/u)
    assert.match(packageManifest.scripts['package:mac:adhoc'], /--adhoc$/u)
    assert.doesNotMatch(packageManifest.scripts['package:mac:adhoc'], /--signed/u)
  })

  it('removes the deploy-only broken desktop self-link before signing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'unilab-packaged-app-'))
    const link = path.join(
      root,
      'Contents',
      'Resources',
      'desktop',
      'node_modules',
      '.pnpm',
      'node_modules',
      '@unilab',
      'desktop'
    )
    try {
      await mkdir(path.dirname(link), { recursive: true })
      await symlink('/missing/deploy-only-workspace-package', link)

      await removePackagedDesktopSelfLink(root)

      await assert.rejects(lstat(link), error => error?.code === 'ENOENT')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
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
