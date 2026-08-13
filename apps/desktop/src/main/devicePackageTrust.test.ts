import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { DevicePackageTrustStore } from './devicePackageTrust'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(
    directory,
    { recursive: true, force: true }
  )))
})

describe('DevicePackageTrustStore', () => {
  it('requires a first-use decision for each unsigned content hash and audits it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-package-trust-'))
    temporaryDirectories.push(root)
    const workspace = join(root, 'workspace')
    const stateDirectory = join(root, 'state')
    await writeFile(join(root, 'placeholder'), '')
    await mkdir(workspace)
    await writeFile(join(workspace, 'package.yaml'), 'package:\n  name: plc\n')
    await writeFile(join(workspace, 'driver.py'), 'VERSION = 1\n')
    const store = new DevicePackageTrustStore(stateDirectory)

    const first = await store.inspect(workspace)
    expect(first).toMatchObject({
      signatureStatus: 'unsigned',
      confirmationRequired: true,
      trusted: false
    })

    await store.confirm(workspace, first.contentHash)
    await expect(store.inspect(workspace)).resolves.toMatchObject({
      contentHash: first.contentHash,
      confirmationRequired: false,
      trusted: true
    })
    expect(await readFile(join(stateDirectory, 'audit.jsonl'), 'utf8'))
      .toContain(first.contentHash)

    await writeFile(join(workspace, 'driver.py'), 'VERSION = 2\n')
    await expect(store.inspect(workspace)).resolves.toMatchObject({
      confirmationRequired: true,
      trusted: false
    })
  })

  it('surfaces an invalid signature without preventing user confirmation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-package-signature-'))
    temporaryDirectories.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    await writeFile(join(workspace, 'package.yaml'), 'package:\n  name: plc\n')
    await writeFile(join(workspace, 'unilab.package-signature.json'), JSON.stringify({
      schemaVersion: 1,
      algorithm: 'ed25519',
      publicKey: 'not-a-public-key',
      signature: 'bm90LWEtc2lnbmF0dXJl'
    }))
    const store = new DevicePackageTrustStore(join(root, 'state'))

    const inspection = await store.inspect(workspace)
    expect(inspection).toMatchObject({
      signatureStatus: 'invalid',
      confirmationRequired: true
    })
    await expect(store.confirm(workspace, inspection.contentHash)).resolves
      .toMatchObject({ trusted: true, signatureStatus: 'invalid' })
  })
})
