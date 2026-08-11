import assert from 'node:assert/strict'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import * as asar from '@electron/asar'

import {
  EXTERNAL_ONLY_AGENT_CLIS,
  PINNED_AGENT_DISTRIBUTION_VERSION,
  prepareBundledAgentPayload,
  resolveAgentTarget
} from './agent-payload.mjs'

describe('bundled Workbench Agent payload', () => {
  it('stages the pinned renderer and matching native aioncore', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-agent-payload-'))
    const source = join(root, 'AionUi.app', 'Contents', 'Resources')
    const destination = join(root, 'payload')
    const asarSource = join(root, 'asar-source')
    try {
      await mkdir(join(source, 'bundled-aioncore', 'darwin-arm64'), {
        recursive: true
      })
      await mkdir(join(
        source,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'cli',
        'codex',
        '0.144.6',
        'darwin-arm64'
      ), { recursive: true })
      await mkdir(join(
        source,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'cli',
        'claude',
        '2.1.215',
        'darwin-arm64'
      ), { recursive: true })
      await mkdir(asarSource, { recursive: true })
      await writeFile(join(asarSource, 'package.json'), JSON.stringify({
        version: PINNED_AGENT_DISTRIBUTION_VERSION
      }))
      await asar.createPackage(asarSource, join(source, 'app.asar'))
      await writeFile(
        join(source, 'bundled-aioncore', 'darwin-arm64', 'aioncore'),
        'agent-binary'
      )
      await writeFile(
        join(source, 'bundled-aioncore', 'darwin-arm64', 'npm-cli.js'),
        'managed-launcher'
      )
      await symlink(
        '../darwin-arm64/npm-cli.js',
        join(source, 'bundled-aioncore', 'darwin-arm64', 'npm')
      )
      await writeFile(join(
        source,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'cli',
        'codex',
        '0.144.6',
        'darwin-arm64',
        'codex'
      ), 'forbidden-codex')
      await writeFile(join(
        source,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'cli',
        'claude',
        '2.1.215',
        'darwin-arm64',
        'claude'
      ), 'forbidden-claude')
      await writeFile(join(
        source,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'manifest.json'
      ), JSON.stringify({
        schemaVersion: 2,
        clis: [
          { name: 'codex', version: '0.144.6' },
          { name: 'claude', version: '2.1.215' }
        ]
      }))

      const result = prepareBundledAgentPayload(destination, {
        sourcePath: join(root, 'AionUi.app'),
        platform: 'darwin',
        architecture: 'arm64'
      })

      assert.equal(result.version, PINNED_AGENT_DISTRIBUTION_VERSION)
      assert.equal(
        await readFile(join(destination, 'app.asar'), 'utf8').then(
          () => true,
          () => false
        ),
        true
      )
      assert.equal(
        await readFile(
          join(destination, 'bundled-aioncore', 'darwin-arm64', 'aioncore'),
          'utf8'
        ),
        'agent-binary'
      )
      assert.equal(
        (await lstat(join(
          destination,
          'bundled-aioncore',
          'darwin-arm64',
          'npm'
        ))).isSymbolicLink(),
        false
      )
      await assert.rejects(readFile(join(
        destination,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'cli',
        'codex',
        '0.144.6',
        'darwin-arm64',
        'codex'
      )), error => error?.code === 'ENOENT')
      await assert.rejects(readFile(join(
        destination,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'cli',
        'claude',
        '2.1.215',
        'darwin-arm64',
        'claude'
      )), error => error?.code === 'ENOENT')
      const managedManifest = JSON.parse(await readFile(join(
        destination,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources',
        'manifest.json'
      ), 'utf8'))
      assert.deepEqual(managedManifest.clis, [])
      const payloadManifest = JSON.parse(await readFile(
        join(destination, 'payload.json'),
        'utf8'
      ))
      assert.deepEqual(payloadManifest.bundledClis, [])
      assert.deepEqual(payloadManifest.externalClis, EXTERNAL_ONLY_AGENT_CLIS)
      if (process.platform === 'darwin') {
        const attributes = spawnSync('xattr', [
          join(destination, 'bundled-aioncore', 'darwin-arm64', 'aioncore')
        ], { encoding: 'utf8' })
        assert.doesNotMatch(attributes.stdout, /com\.apple\.quarantine/u)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('maps each native packaging target to its own Agent executable', () => {
    assert.deepEqual(resolveAgentTarget('darwin', 'arm64'), {
      directory: 'darwin-arm64',
      executable: 'aioncore'
    })
    assert.deepEqual(resolveAgentTarget('linux', 'x64'), {
      directory: 'linux-x64',
      executable: 'aioncore'
    })
    assert.deepEqual(resolveAgentTarget('win32', 'x64'), {
      directory: 'windows-x64',
      executable: 'aioncore.exe'
    })
  })
})
