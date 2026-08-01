import { describe, expect, it, vi } from 'vitest'

import {
  WorkflowDirtySessions,
  workflowUuidFromPanelConfig
} from './workflowSessions'

describe('workflow panel sessions', () => {
  it('binds an explicit Workflow UUID from each panel instance', () => {
    expect(workflowUuidFromPanelConfig({
      workflow_uuid: '11111111-1111-4111-8111-111111111111'
    })).toBe('11111111-1111-4111-8111-111111111111')
    expect(workflowUuidFromPanelConfig({ workflow_uuid: 7 })).toBeNull()
    expect(workflowUuidFromPanelConfig(undefined)).toBeNull()
  })

  it('aggregates dirty state across independent Workflow panel instances', () => {
    const changed = vi.fn()
    const sessions = new WorkflowDirtySessions(changed)

    sessions.update('workflow-a', true)
    sessions.update('workflow-b', true)
    sessions.update('workflow-a', false)
    expect(changed.mock.calls.map(([value]) => value)).toEqual([
      true,
      true,
      true
    ])
    expect(sessions.hasUnsavedChanges).toBe(true)

    sessions.update('workflow-b', false)
    expect(sessions.hasUnsavedChanges).toBe(false)
    expect(changed).toHaveBeenLastCalledWith(false)
  })
})
