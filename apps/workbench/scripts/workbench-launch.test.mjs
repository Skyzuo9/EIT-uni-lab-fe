import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  createWorkbenchRendererUrl,
  discoverWorkbenchPythonEnvironment,
  resolveWorkbenchLaunchConfiguration,
  resolveWorkbenchLaunchMode
} from './workbench-launch.mjs'

describe('Workbench launch contract', () => {
  it('keeps browser mode as the default and accepts desktop explicitly', () => {
    assert.equal(resolveWorkbenchLaunchMode([]), 'browser')
    assert.equal(resolveWorkbenchLaunchMode(['--desktop']), 'desktop')
    assert.throws(
      () => resolveWorkbenchLaunchMode(['--destkop']),
      /Unknown Workbench argument/
    )
  })

  it('accepts explicit workspace, OS, environment and port selections', () => {
    assert.deepEqual(resolveWorkbenchLaunchConfiguration([
      '--desktop',
      '--workspace', '/tmp/workspace',
      '--os-project', '/tmp/os',
      '--python-env', '/tmp/env',
      '--port', '3110',
      '--workflow', 'workflow-1'
    ], {}, '/tmp'), {
      mode: 'desktop',
      workspace: '/tmp/workspace',
      osProject: '/tmp/os',
      pythonEnvironment: '/tmp/env',
      port: 3110,
      workflowUuid: 'workflow-1'
    })
    assert.throws(
      () => resolveWorkbenchLaunchConfiguration(['--workspace']),
      /requires a value/
    )
  })

  it('discovers the same executable environment before Theia starts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'unilab-launch-env-'))
    const environmentRoot = path.join(root, 'env')
    await mkdir(path.join(environmentRoot, 'bin'), { recursive: true })
    try {
      for (const executable of ['python', 'unilab']) {
        const target = path.join(environmentRoot, 'bin', executable)
        await writeFile(target, '#!/bin/sh\nexit 0\n')
        await chmod(target, 0o755)
      }
      assert.equal(await discoverWorkbenchPythonEnvironment({
        environment: { PATH: path.join(environmentRoot, 'bin') },
        homeDirectory: root,
        platform: 'darwin'
      }), await realpath(environmentRoot))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('projects workspace and workflow identity into the loopback URL', () => {
    assert.equal(createWorkbenchRendererUrl({
      port: 3110,
      workspace: '/tmp/Uni Lab/SZLab',
      workflowUuid: 'workflow-1'
    }), 'http://127.0.0.1:3110/?workflowUuid=workflow-1#/tmp/Uni%20Lab/SZLab')
  })
})
