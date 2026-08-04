import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  MIN_LINUX_INSTALLER_BYTES,
  findLinuxInstaller,
  validatePackagedLinuxApp
} from './package-linux.mjs'
import { MAX_PACKAGED_APP_BYTES } from './package-windows.mjs'

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Linux package publication gates', () => {
  it('accepts only a complete ELF AppImage', () => {
    const outputDirectory = createOutputDirectory()
    const installerPath = join(outputDirectory, 'Uni-Lab-0.1.0-x86_64.AppImage')
    const descriptor = openSync(installerPath, 'w')
    try {
      ftruncateSync(descriptor, MIN_LINUX_INSTALLER_BYTES)
      writeSync(descriptor, Buffer.from([0x7f, 0x45, 0x4c, 0x46]), 0, 4, 0)
    } finally {
      closeSync(descriptor)
    }

    expect(findLinuxInstaller(outputDirectory)).toEqual({
      path: installerPath,
      size: MIN_LINUX_INSTALLER_BYTES
    })
  })

  it('rejects a Linux app archive over the dependency budget', () => {
    const outputDirectory = createOutputDirectory()
    const resourcesDirectory = join(
      outputDirectory,
      'linux-unpacked',
      'resources'
    )
    mkdirSync(resourcesDirectory, { recursive: true })
    const descriptor = openSync(join(resourcesDirectory, 'app.asar'), 'w')
    try {
      ftruncateSync(descriptor, MAX_PACKAGED_APP_BYTES + 1)
    } finally {
      closeSync(descriptor)
    }

    expect(() => validatePackagedLinuxApp(outputDirectory))
      .toThrow(/超出 32\.0 MiB 预算/)
  })

  it('rejects a packaged app that omitted the managed Runtime payload', () => {
    const outputDirectory = createOutputDirectory()
    const resourcesDirectory = join(
      outputDirectory,
      'linux-unpacked',
      'resources'
    )
    mkdirSync(resourcesDirectory, { recursive: true })
    const descriptor = openSync(join(resourcesDirectory, 'app.asar'), 'w')
    closeSync(descriptor)

    expect(() => validatePackagedLinuxApp(outputDirectory))
      .toThrow(/Runtime manifest/)
  })
})

function createOutputDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'unilab-linux-package-test-'))
  temporaryDirectories.push(directory)
  return directory
}
