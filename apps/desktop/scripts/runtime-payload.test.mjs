import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, it } from 'vitest'

import { prepareRuntimePayload } from './runtime-payload.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('runtime payload', () => {
  it('copies one Constructor installer and writes its immutable manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'unilab-runtime-payload-'))
    temporaryDirectories.push(root)
    const installer = join(root, 'Uni-Lab-OS-0.11.3-linux-64.sh')
    const destination = join(root, 'payload')
    writeFileSync(installer, 'constructor fixture')

    const result = prepareRuntimePayload({
      installerPath: installer,
      runtimeVersion: '0.11.3',
      platform: 'linux-64',
      destinationDirectory: destination
    })

    assert.equal(basename(result.installerPath), basename(installer))
    assert.deepEqual(
      JSON.parse(readFileSync(result.manifestPath, 'utf8')),
      {
        schemaVersion: 1,
        runtimeVersion: '0.11.3',
        platform: 'linux-64',
        installerFile: basename(installer),
        sha256: 'c14e46b0910821cea36c7911df493bbec8cfac1f91c770ae1972600ee85ddd23'
      }
    )
  })
})
