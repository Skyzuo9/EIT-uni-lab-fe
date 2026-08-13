import { describe, expect, it } from 'vitest'

import { workflowNodeVisualKind } from './workflowNodeVisualKind'

describe('workflowNodeVisualKind', () => {
  it.each([
    { symbol: 's_z_lab_标准物料转运' },
    { definitionFqid: 'szlab_poly_studio.workflows.material_transfer.s_z_lab_标准物料转运' },
    { definitionFqid: 'example.workflows.material_transfer' }
  ])('recognizes a published standard material transfer identity', (source) => {
    expect(workflowNodeVisualKind(source)).toBe('robot-transfer')
  })

  it('does not infer transfer semantics from unrelated published identities', () => {
    expect(workflowNodeVisualKind({
      symbol: 'move_material_for_assay',
      definitionFqid: 'example.workflows.prepare_sample'
    })).toBeUndefined()
  })
})
