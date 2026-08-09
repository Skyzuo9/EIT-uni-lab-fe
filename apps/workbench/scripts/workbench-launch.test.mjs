import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  createWorkbenchRendererUrl,
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

  it('projects workspace and workflow identity into the loopback URL', () => {
    assert.equal(createWorkbenchRendererUrl({
      port: 3110,
      workspace: '/tmp/Uni Lab/SZLab',
      workflowUuid: 'workflow-1'
    }), 'http://127.0.0.1:3110/?workflowUuid=workflow-1#/tmp/Uni%20Lab/SZLab')
  })
})
