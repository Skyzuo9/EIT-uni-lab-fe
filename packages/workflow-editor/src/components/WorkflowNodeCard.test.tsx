import { describe, expect, it } from 'vitest'

import {
  workflowNodeAllowsDebugMarkers,
  workflowNodeKindLabel,
  workflowNodeStateLabel
} from './WorkflowNodeCard'

describe('MaterialSource node semantics', () => {
  it('is explicitly non-Action and uses material-resolution status language', () => {
    expect(workflowNodeKindLabel('material_source')).toBe('物料来源')
    expect(workflowNodeAllowsDebugMarkers('material_source')).toBe(false)
    expect(workflowNodeStateLabel('material_source', 'material_waiting'))
      .toBe('等待物料')
    expect(workflowNodeStateLabel('material_source', 'success'))
      .toBe('物料已绑定')
    expect(workflowNodeStateLabel('material_source', 'failed'))
      .toBe('物料解析失败')
  })
})
