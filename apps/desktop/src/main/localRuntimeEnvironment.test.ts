import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { discoverDefaultCondaEnvironment } from './localRuntimeEnvironment'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, {
      recursive: true,
      force: true
    }))
  )
})

describe('discoverDefaultCondaEnvironment', () => {
  it('prefers the active compatible Conda environment', async () => {
    const fixture = await createFixture()
    const activeEnvironment = await createEnvironment(
      join(fixture, 'active-environment')
    )
    await createEnvironment(join(fixture, 'miniforge3', 'envs', 'unilab'))

    await expect(discoverDefaultCondaEnvironment({
      environment: { CONDA_PREFIX: activeEnvironment, PATH: '' },
      homeDirectory: fixture
    })).resolves.toBe(activeEnvironment)
  })

  it('discovers unilab from PATH before common install locations', async () => {
    const fixture = await createFixture()
    const pathEnvironment = await createEnvironment(
      join(fixture, 'custom', 'envs', 'lab-runtime')
    )
    const pathDirectory = join(fixture, 'commands')
    await mkdir(pathDirectory, { recursive: true })
    await symlink(
      join(pathEnvironment, 'bin', 'unilab'),
      join(pathDirectory, 'unilab')
    )

    await expect(discoverDefaultCondaEnvironment({
      environment: { PATH: pathDirectory },
      homeDirectory: fixture
    })).resolves.toBe(pathEnvironment)
  })

  it('falls back to the standard Miniforge unilab environment', async () => {
    const fixture = await createFixture()
    const expected = await createEnvironment(
      join(fixture, 'miniforge3', 'envs', 'unilab')
    )

    await expect(discoverDefaultCondaEnvironment({
      environment: {
        CONDA_ENVS_PATH: [join(fixture, 'missing-a'), join(fixture, 'missing-b')]
          .join(delimiter),
        PATH: ''
      },
      homeDirectory: fixture
    })).resolves.toBe(expected)
  })

  it('returns null when no compatible environment exists', async () => {
    const fixture = await createFixture()

    await expect(discoverDefaultCondaEnvironment({
      environment: { PATH: '' },
      homeDirectory: fixture
    })).resolves.toBeNull()
  })
})

async function createFixture(): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), 'unilab-conda-discovery-'))
  temporaryDirectories.push(fixture)
  return fixture
}

async function createEnvironment(environmentPath: string): Promise<string> {
  const executableDirectory = join(environmentPath, 'bin')
  const python = join(executableDirectory, 'python')
  const unilab = join(executableDirectory, 'unilab')
  await mkdir(executableDirectory, { recursive: true })
  await Promise.all([writeFile(python, ''), writeFile(unilab, '')])
  await Promise.all([chmod(python, 0o755), chmod(unilab, 0o755)])
  return environmentPath
}
