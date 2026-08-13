import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'

import {
  acquireRemoteAccessLease,
  createRemoteCapabilityAuthority,
  readRemoteAccessMetadata,
  validateRemoteCapability
} from './remote-access.mjs'

const roots = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, {
    recursive: true,
    force: true
  })))
})

describe('remote Workbench capability', () => {
  it('binds the signed token to PID, port, generation and expiry', () => {
    let time = 1_000_000
    const secret = Buffer.alloc(32, 7)
    const authority = createRemoteCapabilityAuthority({
      pid: 101,
      port: 8443,
      generation: 'generation-00000001',
      ttlMs: 60_000,
      now: () => time,
      secret,
      nonce: 'nonce'
    })

    assert.equal(authority.validate(authority.token).valid, true)
    const wrongPort = validateRemoteCapability(authority.token, {
      secret,
      expected: { ...authority.identity, port: 8444 },
      now: () => time
    })
    assert.deepEqual(wrongPort, {
      valid: false,
      code: 'identity_mismatch'
    })
    const tampered = `${authority.token.slice(0, -1)}x`
    assert.equal(authority.validate(tampered).valid, false)
    time = authority.identity.expiresAt
    assert.deepEqual(authority.validate(authority.token), {
      valid: false,
      code: 'expired'
    })
  })

  it('persists only a digest and fails closed on a live Workspace lease', async () => {
    const workspace = await fixtureWorkspace()
    const authority = createRemoteCapabilityAuthority({
      pid: process.pid,
      port: 8443,
      generation: 'generation-00000002'
    })
    const lease = await acquireRemoteAccessLease({
      workspacePath: workspace,
      identity: authority.identity,
      tokenDigest: authority.tokenDigest,
      backendPort: 3100,
      publicOrigin: 'https://workbench.example.test'
    })
    const persisted = await readFile(lease.metadataPath, 'utf8')

    assert.doesNotMatch(persisted, new RegExp(authority.token, 'u'))
    assert.match(persisted, new RegExp(authority.tokenDigest, 'u'))
    await assert.rejects(() => acquireRemoteAccessLease({
      workspacePath: workspace,
      identity: {
        ...authority.identity,
        port: 8444,
        generation: 'generation-00000003'
      },
      tokenDigest: 'b'.repeat(64),
      backendPort: 3100,
      publicOrigin: 'https://workbench.example.test'
    }), /already has a live remote Workbench/)

    await lease.release()
    assert.equal(await readRemoteAccessMetadata(lease.metadataPath), null)
  })

  it('isolates a stale lease and never lets the old owner delete the new one', async () => {
    const workspace = await fixtureWorkspace()
    const first = await acquireRemoteAccessLease({
      workspacePath: workspace,
      identity: identity(111, 8443, 'generation-00000004'),
      tokenDigest: 'a'.repeat(64),
      backendPort: 3100,
      publicOrigin: 'https://workbench.example.test'
    })
    const second = await acquireRemoteAccessLease({
      workspacePath: workspace,
      identity: identity(222, 8444, 'generation-00000005'),
      tokenDigest: 'b'.repeat(64),
      backendPort: 3101,
      publicOrigin: 'https://workbench.example.test',
      processAlive: () => false,
      now: () => new Date('2026-08-10T09:00:00.000Z')
    })

    await first.release()
    assert.equal(
      (await readRemoteAccessMetadata(second.metadataPath)).generation,
      'generation-00000005'
    )
    const recovery = await readdir(path.join(
      workspace,
      '.unilabos',
      'recovery'
    ))
    assert.equal(recovery.length, 1)
    assert.match(recovery[0], /^stale-remote-access-/u)

    await second.release()
  })
})

function identity(pid, port, generation) {
  return {
    version: 1,
    pid,
    port,
    generation,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    nonce: 'nonce'
  }
}

async function fixtureWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unilab-remote-access-'))
  roots.push(root)
  return root
}
