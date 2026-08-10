import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const workbenchDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const service = await readFile(
  path.join(workbenchDirectory, 'linux', 'unilab-workbench.service'),
  'utf8'
)

describe('Linux headless Workbench service', () => {
  it('runs only the authenticated remote entry point on pinned Node', () => {
    assert.match(service, /node-v24\.14\.0\/bin\/node/u)
    assert.match(service, /start-workbench\.mjs --remote/u)
    assert.match(service, /EnvironmentFile=\/etc\/unilab\/workbench\.env/u)
    assert.doesNotMatch(service, /--tls-cert|--tls-key|--access-url-file/u)
    assert.doesNotMatch(service, /TOKEN=/u)
  })

  it('uses a private runtime directory and bounded process-group shutdown', () => {
    assert.match(service, /RuntimeDirectory=unilab-workbench/u)
    assert.match(service, /RuntimeDirectoryMode=0700/u)
    assert.match(service, /UMask=0077/u)
    assert.match(service, /KillMode=control-group/u)
    assert.match(service, /TimeoutStopSec=20/u)
  })
})
