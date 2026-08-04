import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ManagedRuntimeInstallation } from './managedRuntimeInstallation'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(
    directory,
    { recursive: true, force: true }
  )))
})

describe('ManagedRuntimeInstallation', () => {
  it('verifies and installs the bundled Constructor payload once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-managed-runtime-'))
    temporaryDirectories.push(root)
    const resourcesDirectory = join(root, 'resources')
    const dataDirectory = join(root, 'data')
    const payloadDirectory = join(resourcesDirectory, 'runtime-installer')
    const installerName = 'Uni-Lab-OS-0.11.3-linux-64.sh'
    const installerPath = join(payloadDirectory, installerName)
    const installerBytes = Buffer.from('offline-constructor-payload')
    await mkdir(payloadDirectory, { recursive: true })
    await mkdir(
      join(resourcesDirectory, 'default-workspace', 'deployment', 'graphs'),
      { recursive: true }
    )
    await writeFile(installerPath, installerBytes)
    await writeFile(join(payloadDirectory, 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      runtimeVersion: '0.11.3',
      platform: 'linux-64',
      installerFile: installerName,
      sha256: createHash('sha256').update(installerBytes).digest('hex')
    }))
    await Promise.all([
      writeFile(
        join(resourcesDirectory, 'default-workspace', 'deployment', 'graphs', 'device.json'),
        '{}'
      ),
      writeFile(
        join(resourcesDirectory, 'default-workspace', 'deployment', 'local_config.py'),
        ''
      ),
      writeFile(
        join(resourcesDirectory, 'default-workspace', 'package.yaml'),
        'package:\n  name: bundled-reference\n'
      )
    ])

    const runner = vi.fn(async (_installerPath: string, prefix: string) => {
      await mkdir(join(prefix, 'bin'), { recursive: true })
      await Promise.all([
        writeFile(join(prefix, 'bin', 'python'), ''),
        writeFile(join(prefix, 'bin', 'unilab'), ''),
        writeFile(join(prefix, 'bin', 'unilab-supervisor'), '')
      ])
      await Promise.all([
        chmod(join(prefix, 'bin', 'python'), 0o755),
        chmod(join(prefix, 'bin', 'unilab'), 0o755),
        chmod(join(prefix, 'bin', 'unilab-supervisor'), 0o755)
      ])
    })
    const installation = new ManagedRuntimeInstallation({
      resourcesDirectory,
      dataDirectory,
      platform: 'linux',
      runInstaller: runner
    })

    await expect(installation.getModeInfo()).resolves.toEqual({
      mode: 'managed',
      label: '内置 Runtime',
      runtimeVersion: '0.11.3',
      defaultLaunchConfig: {
        graphPath: join(
          resourcesDirectory,
          'default-workspace',
          'deployment',
          'graphs',
          'device.json'
        ),
        osProjectPath: '',
        szlabProjectPath: join(resourcesDirectory, 'default-workspace'),
        environmentPath: '',
        simulatorProjectPath: ''
      }
    })
    expect(runner).not.toHaveBeenCalled()

    const first = await installation.ensureInstalled()
    const second = await installation.ensureInstalled()

    expect(first).toEqual(second)
    expect(first.runtimeVersion).toBe('0.11.3')
    expect(first.platform).toBe('linux-64')
    expect(first.prefix).toContain(join('managed-runtime', 'versions'))
    expect(first.unilabExecutable).toBe(join(first.prefix, 'bin', 'unilab'))
    expect(first.supervisorExecutable).toBe(
      join(first.prefix, 'bin', 'unilab-supervisor')
    )
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(installerPath, expect.any(String))
  })

  it('serializes concurrent installers that share one user data directory', async () => {
    const fixture = await createInstallationFixture()
    let releaseInstaller: (() => void) | null = null
    const installerCanFinish = new Promise<void>((resolvePromise) => {
      releaseInstaller = resolvePromise
    })
    const runner = vi.fn(async (_installerPath: string, prefix: string) => {
      await installerCanFinish
      await writeLinuxRuntime(prefix)
    })
    const first = new ManagedRuntimeInstallation({
      ...fixture,
      platform: 'linux',
      runInstaller: runner
    })
    const second = new ManagedRuntimeInstallation({
      ...fixture,
      platform: 'linux',
      runInstaller: runner
    })

    const firstInstall = first.ensureInstalled()
    const secondInstall = second.ensureInstalled()
    await vi.waitFor(() => expect(runner).toHaveBeenCalledTimes(1))
    releaseInstaller!()

    await expect(Promise.all([firstInstall, secondInstall])).resolves.toEqual([
      expect.objectContaining({ runtimeVersion: '0.11.3' }),
      expect.objectContaining({ runtimeVersion: '0.11.3' })
    ])
    expect(runner).toHaveBeenCalledTimes(1)
  })
})

async function createInstallationFixture(): Promise<{
  resourcesDirectory: string
  dataDirectory: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'unilab-managed-runtime-lock-'))
  temporaryDirectories.push(root)
  const resourcesDirectory = join(root, 'resources')
  const dataDirectory = join(root, 'data')
  const payloadDirectory = join(resourcesDirectory, 'runtime-installer')
  const installerName = 'Uni-Lab-OS-0.11.3-linux-64.sh'
  const installerBytes = Buffer.from('offline-constructor-payload')
  await mkdir(payloadDirectory, { recursive: true })
  await writeFile(join(payloadDirectory, installerName), installerBytes)
  await writeFile(join(payloadDirectory, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    runtimeVersion: '0.11.3',
    platform: 'linux-64',
    installerFile: installerName,
    sha256: createHash('sha256').update(installerBytes).digest('hex')
  }))
  return { resourcesDirectory, dataDirectory }
}

async function writeLinuxRuntime(prefix: string): Promise<void> {
  await mkdir(join(prefix, 'bin'), { recursive: true })
  const executables = ['python', 'unilab', 'unilab-supervisor'].map(
    (name) => join(prefix, 'bin', name)
  )
  await Promise.all(executables.map((path) => writeFile(path, '')))
  await Promise.all(executables.map((path) => chmod(path, 0o755)))
}
