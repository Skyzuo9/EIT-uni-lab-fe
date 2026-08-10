import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolvePlcSimulatorLaunch } from './index'

const fixtures: string[] = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(path => rm(path, {
    recursive: true,
    force: true
  })))
})

describe('PLC-Sim launch contract', () => {
  it('accepts a repository root and returns a shell-free Python launch plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-local-environment-'))
    fixtures.push(root)
    const environmentPath = join(root, 'env')
    const projectPath = join(root, 'PLC-Sim')
    await Promise.all([
      mkdir(join(environmentPath, 'bin'), { recursive: true }),
      mkdir(join(projectPath, 'OpcUaSim', 'gui'), { recursive: true })
    ])
    await Promise.all([
      writeFile(join(environmentPath, 'bin', 'python'), '#!/bin/sh\n'),
      writeFile(join(environmentPath, 'bin', 'unilab'), '#!/bin/sh\n'),
      writeFile(join(projectPath, 'OpcUaSim', 'gui', 'backend.py'), '')
    ])
    await Promise.all([
      chmod(join(environmentPath, 'bin', 'python'), 0o755),
      chmod(join(environmentPath, 'bin', 'unilab'), 0o755)
    ])

    await expect(resolvePlcSimulatorLaunch({
      environmentPath,
      projectPath,
      platform: 'linux',
      inheritedEnvironment: { PATH: '/usr/bin' }
    })).resolves.toMatchObject({
      command: join(environmentPath, 'bin', 'python'),
      cwd: join(projectPath, 'OpcUaSim'),
      args: ['-m', 'gui.backend', '--host', '127.0.0.1', '--port', '18765'],
      guiUrl: 'http://127.0.0.1:18765',
      opcUaUrl: 'opc.tcp://127.0.0.1:4855'
    })
  })
})
