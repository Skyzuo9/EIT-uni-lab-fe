import { describe, expect, it } from 'vitest'

import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import {
  materialTraceAccent,
  projectMaterialTraces
} from './workflowMaterialTrace'

const sourceUuid = '20000000-0000-4000-8000-000000000001'
const actionUuid = '20000000-0000-4000-8000-000000000002'

describe('Material trace projection', () => {
  it('uses stable identity accents only on real Handle edges and corroborates chips by label', () => {
    const nodes: WorkflowNode[] = [
      workflowNode(sourceUuid, 'assay_plate', 'material_source'),
      workflowNode(actionUuid, 'mix', 'device')
    ]
    const links: WorkflowLink[] = [{
      source: sourceUuid,
      target: actionUuid,
      type: 'control',
      sourceHandleUuid: '40000000-0000-4000-8000-000000000001',
      targetHandleUuid: '40000000-0000-4000-8000-000000000002'
    }]

    const projection = projectMaterialTraces(nodes, links)

    expect(projection.edgeAccents.get(0)).toBe(materialTraceAccent(sourceUuid))
    expect(projection.chipsByNode.get(actionUuid)).toEqual([{
      handleUuid: '40000000-0000-4000-8000-000000000002',
      label: 'assay_plate',
      sourceNodeUuid: sourceUuid,
      accent: materialTraceAccent(sourceUuid),
      shortIdentity: '0001'
    }])
    expect(materialTraceAccent(sourceUuid)).not.toMatch(
      /success|warning|danger|error/i
    )
  })
})

function workflowNode(
  id: string,
  name: string,
  type: string
): WorkflowNode {
  return {
    id,
    name,
    type,
    className: type,
    labNodeType: type
  }
}
