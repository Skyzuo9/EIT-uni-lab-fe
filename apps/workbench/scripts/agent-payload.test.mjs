import assert from 'node:assert/strict'
import {
  chmod,
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

  it('keeps bundled npm and npx executable after package symlinks are materialized', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-agent-node-launchers-'))
    const source = join(root, 'AionUi.app', 'Contents', 'Resources')
    const destination = join(root, 'payload')
    const asarSource = join(root, 'asar-source')
    const nativeRoot = join(
      source,
      'bundled-aioncore',
      'darwin-arm64'
    )
    const nodeRoot = join(
      nativeRoot,
      'managed-resources',
      'node',
      'node-v24.11.0-darwin-arm64'
    )
    try {
      await mkdir(join(nodeRoot, 'bin'), { recursive: true })
      await mkdir(join(nodeRoot, 'lib', 'node_modules', 'npm', 'bin'), {
        recursive: true
      })
      await mkdir(join(nodeRoot, 'lib', 'node_modules', 'npm', 'lib'), {
        recursive: true
      })
      await mkdir(asarSource, { recursive: true })
      await writeFile(join(asarSource, 'package.json'), JSON.stringify({
        version: PINNED_AGENT_DISTRIBUTION_VERSION
      }))
      await asar.createPackage(asarSource, join(source, 'app.asar'))
      await writeFile(join(nativeRoot, 'aioncore'), 'agent-binary')
      await writeFile(join(
        nativeRoot,
        'managed-resources',
        'manifest.json'
      ), JSON.stringify({
        schemaVersion: 2,
        runtimeKey: 'darwin-arm64',
        node: {
          version: '24.11.0',
          root: 'node/node-v24.11.0-darwin-arm64',
          executable: 'bin/node'
        },
        clis: []
      }))
      await writeFile(
        join(nodeRoot, 'bin', 'node'),
        `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$@"\n`
      )
      await chmod(join(nodeRoot, 'bin', 'node'), 0o755)
      await writeFile(
        join(nodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        "#!/usr/bin/env node\nrequire('../lib/cli.js')(process)\n"
      )
      await writeFile(
        join(nodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
        "#!/usr/bin/env node\nrequire('../lib/cli.js')(process)\n"
      )
      await chmod(
        join(nodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        0o755
      )
      await chmod(
        join(nodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
        0o755
      )
      await writeFile(
        join(nodeRoot, 'lib', 'node_modules', 'npm', 'lib', 'cli.js'),
        "module.exports = process => process.stdout.write('11.6.1\\n')\n"
      )
      await symlink(
        '../lib/node_modules/npm/bin/npm-cli.js',
        join(nodeRoot, 'bin', 'npm')
      )
      await symlink(
        '../lib/node_modules/npm/bin/npx-cli.js',
        join(nodeRoot, 'bin', 'npx')
      )

      prepareBundledAgentPayload(destination, {
        sourcePath: join(root, 'AionUi.app'),
        platform: 'darwin',
        architecture: 'arm64'
      })

      for (const launcher of ['npm', 'npx']) {
        const packagedLauncher = join(
          destination,
          'bundled-aioncore',
          'darwin-arm64',
          'managed-resources',
          'node',
          'node-v24.11.0-darwin-arm64',
          'bin',
          launcher
        )
        assert.equal((await lstat(packagedLauncher)).isSymbolicLink(), false)
        const result = spawnSync(packagedLauncher, ['--version'], {
          encoding: 'utf8'
        })
        assert.equal(
          result.status,
          0,
          result.error?.message || result.stderr
        )
        assert.equal(result.stdout.trim(), '11.6.1')
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
