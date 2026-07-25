import { describe, expect, it } from 'vitest'

import { materialIdsFromWorkflowArgs } from './workflowMaterialRefs'

describe('workflow Material references', () => {
  it('extracts only explicit Material ID fields from nested arguments', () => {
    expect(
      materialIdsFromWorkflowArgs({
        material_id: 'plate-1',
        target: {
          materialIds: ['reader-1', 'plate-1'],
          unrelated_uuid: 'must-not-highlight'
        }
      })
    ).toEqual(['plate-1', 'reader-1'])
  })
})
