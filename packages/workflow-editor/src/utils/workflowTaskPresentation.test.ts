import type { WorkflowTask } from '@unilab/services'
import { describe, expect, it } from 'vitest'

import {
  workflowTaskControlStatusLabel,
  workflowTaskControls,
  workflowTaskStatusLabel,
  workflowTaskVisualStatus
} from './workflowTaskPresentation'

describe('Workflow Task admission presentation', () => {
  it('keeps only cancel available while Task authority reports admission_blocked', () => {
    const task = workflowTask({ status: 'admission_blocked' })
    const controls = workflowTaskControls(task, false)

    expect(Object.fromEntries(controls.map((control) => [
      control.command,
      control.disabled
    ]))).toEqual({
      pause: true,
      resume: true,
      step: true,
      cancel: false
    })
    expect(workflowTaskStatusLabel(task.status)).toBe('等待物料准入')
    expect(workflowTaskControlStatusLabel(task)).toBe('等待物料准入')
    expect(workflowTaskVisualStatus(task)).toBe('admission_blocked')
  })
})

function workflowTask(
  override: Partial<WorkflowTask> = {}
): WorkflowTask {
  return {
    uuid: '10000000-0000-4000-8000-000000000001',
    create_time: '2026-08-02T00:00:00Z',
    update_time: '2026-08-02T00:00:00Z',
    meta_data: {},
    workflow_uuid: '20000000-0000-4000-8000-000000000001',
    status: 'pending',
    workflow_snapshot: {},
    execution_plan: {},
    run_mode: 'normal',
    control_status: 'active',
    cleanup_status: 'none',
    trace_context: {},
    input: {},
    output: {},
    error_info: [],
    ...override
  }
}
