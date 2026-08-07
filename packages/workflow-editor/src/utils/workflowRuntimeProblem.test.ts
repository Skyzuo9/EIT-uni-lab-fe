import { describe, expect, it } from 'vitest'

import {
  canRetryWorkflowRuntimeRead,
  workflowRuntimeProblemHeading
} from './workflowRuntimeProblem'

describe('workflow runtime problem presentation', () => {
  it('labels command failures as control errors without offering an unrelated read retry', () => {
    expect(workflowRuntimeProblemHeading('Not Found')).toBe('运行控制操作失败')
    expect(canRetryWorkflowRuntimeRead('Not Found')).toBe(false)
  })

  it('keeps projection failures under the runtime read recovery action', () => {
    expect(workflowRuntimeProblemHeading(null)).toBe('运行状态读取失败')
    expect(canRetryWorkflowRuntimeRead(null)).toBe(true)
  })
})
