import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepareExternalAgentCliEnvironment } from './external-agent-cli'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('external Agent CLI resolution', () => {
  it('prefers a newer installed Codex app over an older PATH entry', async () => {
    const root = await temporaryDirectory()
    const pathCodex = join(root, 'homebrew', 'bin', 'codex')
    const appCodex = join(
      root,
      'Applications',
      'ChatGPT.app',
      'Contents',
      'Resources',
      'codex'
    )
    await fakeCodex(pathCodex, 'codex-cli 0.141.0')
    await fakeCodex(appCodex, 'codex-cli 0.147.0-alpha.1.2')

    const result = await prepareExternalAgentCliEnvironment({
      PATH: dirname(pathCodex)
    }, {
      platform: 'darwin',
      knownCodexCandidates: [appCodex]
    })

    expect(result.codex).toEqual({
      executable: appCodex,
      version: '0.147.0-alpha.1.2'
    })
    expect(result.environment.PATH?.split(delimiter)[0]).toBe(dirname(appCodex))
  })

  it('honours an explicit Codex path even when another candidate is newer', async () => {
    const root = await temporaryDirectory()
    const explicitCodex = join(root, 'explicit', 'codex')
    const appCodex = join(root, 'app', 'codex')
    await fakeCodex(explicitCodex, 'codex-cli 0.145.0')
    await fakeCodex(appCodex, 'codex-cli 0.147.0')

    const result = await prepareExternalAgentCliEnvironment({
      PATH: '',
      UNILAB_CODEX_PATH: explicitCodex
    }, {
      platform: 'darwin',
      knownCodexCandidates: [appCodex]
    })

    expect(result.codex?.executable).toBe(explicitCodex)
    expect(result.environment.PATH?.split(delimiter)[0]).toBe(
      dirname(explicitCodex)
    )
  })

  it('leaves PATH unchanged when no usable Codex installation exists', async () => {
    const originalPath = ['/usr/local/bin', '/usr/bin'].join(delimiter)
    const result = await prepareExternalAgentCliEnvironment({
      PATH: originalPath
    }, {
      platform: 'linux',
      knownCodexCandidates: []
    })

    expect(result.codex).toBeNull()
    expect(result.environment.PATH).toBe(originalPath)
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'unilab-agent-cli-'))
  temporaryDirectories.push(directory)
  return directory
}

async function fakeCodex(path: string, version: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`)
  await chmod(path, 0o755)
}
