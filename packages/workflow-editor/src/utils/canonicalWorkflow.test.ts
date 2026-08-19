import { describe, expect, it } from 'vitest'

import type { WorkflowLink, WorkflowNode } from './parseWorkflow'
import { projectMaterialTraces } from './workflowMaterialTrace'
import {
  CONTROL_DAG_JSON,
  CONTROL_DAG_REVISION,
  createWorkflowExecutionScope,
  parseCanonicalWorkflow,
  projectNestedWorkflow,
  remapWorkflowBreakpoints,
  remapWorkflowNodeId,
  visibleNestedWorkflowNodeId
} from './canonicalWorkflow'

describe('Canonical workflow projection', () => {
  it('keeps control nodes and both branch-labelled edges losslessly', () => {
    const parsed = parseCanonicalWorkflow(CONTROL_DAG_JSON)

    expect(parsed.error).toBeNull()
    expect(parsed.nodes.map((node) => node.type)).toContain('branch')
    expect(parsed.nodes.map((node) => node.type)).toContain('join')
    expect(
      parsed.links
        .filter((edge) => edge.source === 'branch')
        .map((edge) => edge.branch)
    ).toEqual(['true', 'false'])
    expect(parsed.revision?.control_edges).toHaveLength(6)
  })

  it('rejects the legacy lossy visual graph as a run source', () => {
    const parsed = parseCanonicalWorkflow(JSON.stringify({
      nodes: [{ id: 'n1' }],
      edges: []
    }))

    expect(parsed.revision).toBeNull()
    expect(parsed.error).toContain('标准工作流格式（v2）')
  })

  it('remaps breakpoints when Python compilation regenerates node ids', () => {
    const compiled = {
      ...CONTROL_DAG_REVISION,
      invocations: CONTROL_DAG_REVISION.invocations.map((invocation, index) => ({
        ...invocation,
        node_id: `control-demo-${index + 1}`
      }))
    }

    const mapped = remapWorkflowBreakpoints(
      CONTROL_DAG_REVISION,
      compiled,
      new Set(['branch'])
    )

    expect([...mapped]).toEqual(['control-demo-2'])
  })

  it('remaps a marked execution start with the same invocation identity', () => {
    const compiled = {
      ...CONTROL_DAG_REVISION,
      invocations: CONTROL_DAG_REVISION.invocations.map((invocation, index) => ({
        ...invocation,
        node_id: `control-demo-${index + 1}`
      }))
    }

    expect(
      remapWorkflowNodeId(CONTROL_DAG_REVISION, compiled, 'dose')
    ).toBe('control-demo-3')
  })

  it('marks nodes outside the selected start subgraph as before-start', () => {
    const parsed = parseCanonicalWorkflow(CONTROL_DAG_JSON)
    const scope = createWorkflowExecutionScope(
      parsed.nodes,
      parsed.links,
      'dose'
    )

    expect([...scope.executableNodeIds]).toEqual(['dose', 'join', 'heat'])
    expect([...scope.beforeStartNodeIds]).toEqual([
      'measure',
      'branch',
      'inspect'
    ])
  })

  it('derives nested subworkflow parents from Canonical group source ranges', () => {
    const parsed = parseCanonicalWorkflow(JSON.stringify(NESTED_REVISION))
    const byId = new Map(parsed.nodes.map((node) => [node.id, node]))

    expect(byId.get('outer')?.name).toBe('sampling_cycle')
    expect(byId.get('outer')?.groupKind).toBe('subworkflow')
    expect(byId.get('outer')?.collapsedByDefault).toBe(true)
    expect(byId.get('outer')?.childNodeIds).toEqual(['prepare', 'inner'])
    expect(byId.get('inner')?.parentGroupId).toBe('outer')
    expect(byId.get('dose')?.parentGroupId).toBe('inner')
  })

  it('collapses nested groups and rewires only boundary-crossing edges', () => {
    const parsed = parseCanonicalWorkflow(JSON.stringify(NESTED_REVISION))

    const collapsed = projectNestedWorkflow(
      parsed.nodes,
      parsed.links,
      new Set()
    )
    expect(collapsed.nodes.map((node) => node.id)).toEqual(['outer', 'finish'])
    expect(collapsed.links).toMatchObject([
      { source: 'outer', target: 'finish' }
    ])
    expect([...collapsed.hiddenNodeIds]).toEqual(['prepare', 'inner', 'dose'])
    expect(visibleNestedWorkflowNodeId(
      parsed.nodes,
      collapsed.collapsedGroupIds,
      'dose'
    )).toBe('outer')

    const outerExpanded = projectNestedWorkflow(
      parsed.nodes,
      parsed.links,
      new Set(['outer'])
    )
    expect(outerExpanded.nodes.map((node) => node.id)).toEqual([
      'outer',
      'prepare',
      'inner',
      'finish'
    ])
    expect(outerExpanded.links.map(({ source, target }) => [source, target]))
      .toEqual([
        ['outer', 'prepare'],
        ['prepare', 'inner'],
        ['outer', 'finish']
      ])
    expect(visibleNestedWorkflowNodeId(
      parsed.nodes,
      outerExpanded.collapsedGroupIds,
      'dose'
    )).toBe('inner')

    const allExpanded = projectNestedWorkflow(
      parsed.nodes,
      parsed.links,
      new Set(['outer', 'inner'])
    )
    expect(allExpanded.nodes).toHaveLength(5)
    expect(allExpanded.links).toHaveLength(4)
    expect(visibleNestedWorkflowNodeId(
      parsed.nodes,
      allExpanded.collapsedGroupIds,
      'dose'
    )).toBe('dose')
  })

  it('preserves authoritative parallel edges when no endpoint is remapped', () => {
    const nodes = [workflowNode('source'), workflowNode('target')]
    const links: WorkflowLink[] = [
      workflowLink('ready', 'source-ready', 'target-ready'),
      workflowLink('material-a', 'source-material-a', 'target-material-a'),
      workflowLink('material-b', 'source-material-b', 'target-material-b')
    ]

    const projected = projectNestedWorkflow(nodes, links, new Set())

    expect(projected.links.map((link) => link.id)).toEqual([
      'ready',
      'material-a',
      'material-b'
    ])
  })

  it('fails closed on a direct edge that skips a composite boundary', () => {
    const nodes: WorkflowNode[] = [
      workflowNode('outside'),
      workflowNode('outer', {
        groupKind: 'subworkflow',
        collapsedByDefault: true,
        childNodeIds: ['inside'],
        descendantNodeIds: ['inside']
      }),
      workflowNode('inside', { parentGroupId: 'outer' })
    ]
    const projected = projectNestedWorkflow(nodes, [{
      ...workflowLink('illegal', 'outside-output', 'inside-input'),
      source: 'outside',
      target: 'inside'
    }], new Set(['outer']))

    expect(projected.links).toEqual([])
    expect([...projected.rejectedBoundaryLinkIds]).toEqual(['illegal'])
  })

  it('deduplicates remapped collapsed edges but prefers a direct boundary edge', () => {
    const nodes: WorkflowNode[] = [
      workflowNode('outer', {
        groupKind: 'subworkflow',
        collapsedByDefault: true,
        childNodeIds: ['inside-a', 'inside-b'],
        descendantNodeIds: ['inside-a', 'inside-b']
      }),
      workflowNode('inside-a', { parentGroupId: 'outer' }),
      workflowNode('inside-b', { parentGroupId: 'outer' }),
      workflowNode('target')
    ]
    const links: WorkflowLink[] = [
      {
        ...workflowLink('mapped-a', 'inside-source', 'target-input'),
        source: 'inside-a'
      },
      {
        ...workflowLink('mapped-b', 'inside-source', 'target-input'),
        source: 'inside-b'
      },
      workflowLink('direct', 'boundary-source', 'target-input', 'outer')
    ]

    const collapsedOnly = projectNestedWorkflow(
      nodes,
      links.slice(0, 2),
      new Set()
    )
    expect(collapsedOnly.links).toEqual([
      expect.objectContaining({ id: 'mapped-a', source: 'outer' })
    ])

    const projected = projectNestedWorkflow(nodes, links, new Set())

    expect(projected.links).toEqual([
      expect.objectContaining({
        id: 'direct',
        source: 'outer',
        target: 'target',
        sourceHandleUuid: 'boundary-source'
      })
    ])
  })

  it('keeps one material lineage through authoritative expanded composite boundaries', () => {
    const slot = (
      uuid: string,
      dataKey: string,
      ioType: 'source' | 'target'
    ) => ({
      uuid,
      handleKey: dataKey,
      displayName: dataKey,
      dataKey,
      ioType,
      valueType: 'ResourceSlot',
      valueSchema: { $slot: 'ResourceSlot' }
    } as const)
    const nodes: WorkflowNode[] = [
      workflowNode('plate-source', {
        type: 'material_source',
        handles: [slot('plate-source-output', 'plate', 'source')],
        materialSource: {
          mode: 'existing',
          flowRole: 'aliquot_sample',
          mountUuid: 'plate-mount',
          resourceTemplateUuid: 'plate-template'
        }
      }),
      workflowNode('outer', {
        type: 'workflow',
        groupKind: 'subworkflow',
        collapsedByDefault: true,
        childNodeIds: ['transport', 'execute'],
        descendantNodeIds: ['transport', 'execute', 'complete'],
        handles: [
          slot('outer-plate-input', 'plate', 'target'),
          slot('outer-plate-output', 'plate', 'source')
        ],
        compositeBoundaryMappings: {
          targets: {
            'outer-plate-input': [{
              nodeUuid: 'transport',
              handleUuid: 'transport-resource-input'
            }]
          },
          sources: {
            'outer-plate-output': {
              nodeUuid: 'execute',
              handleUuid: 'execute-plate-output'
            }
          }
        }
      }),
      workflowNode('transport', {
        parentGroupId: 'outer',
        handles: [
          slot('transport-resource-input', 'resource', 'target'),
          slot('transport-resource-output', 'resource', 'source')
        ]
      }),
      workflowNode('execute', {
        type: 'workflow',
        groupKind: 'subworkflow',
        parentGroupId: 'outer',
        collapsedByDefault: true,
        childNodeIds: ['complete'],
        descendantNodeIds: ['complete'],
        handles: [
          slot('execute-plate-input', 'plate', 'target'),
          slot('execute-plate-output', 'plate', 'source')
        ],
        compositeBoundaryMappings: {
          targets: {
            'execute-plate-input': [{
              nodeUuid: 'complete',
              handleUuid: 'complete-plate-input'
            }]
          },
          sources: {
            'execute-plate-output': {
              nodeUuid: 'complete',
              handleUuid: 'complete-plate-output'
            }
          }
        }
      }),
      workflowNode('complete', {
        parentGroupId: 'execute',
        handles: [
          slot('complete-plate-input', 'plate', 'target'),
          slot('complete-plate-output', 'plate', 'source')
        ]
      }),
      workflowNode('downstream', {
        handles: [slot('downstream-plate-input', 'plate', 'target')]
      })
    ]
    const links: WorkflowLink[] = [
      {
        ...workflowLink(
          'plate-into-outer',
          'plate-source-output',
          'outer-plate-input',
          'plate-source',
          'outer'
        )
      },
      {
        ...workflowLink(
          'transport-into-execute',
          'transport-resource-output',
          'execute-plate-input',
          'transport',
          'execute'
        )
      },
      {
        ...workflowLink(
          'outer-into-downstream',
          'outer-plate-output',
          'downstream-plate-input',
          'outer',
          'downstream'
        )
      }
    ]

    const projected = projectNestedWorkflow(
      nodes,
      links,
      new Set(['outer', 'execute'])
    )

    expect(projected.links.map((link) => ({
      source: link.source,
      sourceHandleUuid: link.sourceHandleUuid,
      target: link.target,
      targetHandleUuid: link.targetHandleUuid,
      bridge: link.compositeBoundaryBridge
    }))).toEqual([
      {
        source: 'plate-source',
        sourceHandleUuid: 'plate-source-output',
        target: 'outer',
        targetHandleUuid: 'outer-plate-input',
        bridge: undefined
      },
      {
        source: 'outer',
        sourceHandleUuid: 'outer-plate-input',
        target: 'transport',
        targetHandleUuid: 'transport-resource-input',
        bridge: 'target'
      },
      {
        source: 'transport',
        sourceHandleUuid: 'transport-resource-output',
        target: 'execute',
        targetHandleUuid: 'execute-plate-input',
        bridge: undefined
      },
      {
        source: 'execute',
        sourceHandleUuid: 'execute-plate-input',
        target: 'complete',
        targetHandleUuid: 'complete-plate-input',
        bridge: 'target'
      },
      {
        source: 'complete',
        sourceHandleUuid: 'complete-plate-output',
        target: 'execute',
        targetHandleUuid: 'execute-plate-output',
        bridge: 'source'
      },
      {
        source: 'execute',
        sourceHandleUuid: 'execute-plate-output',
        target: 'outer',
        targetHandleUuid: 'outer-plate-output',
        bridge: 'source'
      },
      {
        source: 'outer',
        sourceHandleUuid: 'outer-plate-output',
        target: 'downstream',
        targetHandleUuid: 'downstream-plate-input',
        bridge: undefined
      }
    ])
    expect(projected.rejectedBoundaryLinkIds).toEqual(new Set())

    const traces = projectMaterialTraces(projected.nodes, projected.links)
    expect(traces.lineages).toHaveLength(1)
    expect(traces.lineages[0]?.materialRole).toBe('aliquot_sample')
    expect(new Set(traces.edgeLineages.values())).toEqual(
      new Set(['plate-source'])
    )
  })

  /**
   * 验证原生编写分组只保留成员节点，不作为工作流（Workflow）画布节点重复展示。
   */
  it('hides native authoring groups without hiding their members', () => {
    const parsed = parseCanonicalWorkflow(JSON.stringify(NATIVE_GROUP_REVISION))

    const projected = projectNestedWorkflow(
      parsed.nodes,
      parsed.links,
      new Set()
    )

    expect(projected.nodes.map((node) => node.id)).toEqual([
      'prepare',
      'finish'
    ])
    expect(projected.links.map(({ source, target }) => [source, target]))
      .toEqual([['prepare', 'finish']])
  })
})

function workflowNode(
  id: string,
  overrides: Partial<WorkflowNode> = {}
): WorkflowNode {
  return {
    id,
    name: id,
    type: 'action',
    className: 'test.action',
    labNodeType: 'action',
    ...overrides
  }
}

function workflowLink(
  id: string,
  sourceHandleUuid: string,
  targetHandleUuid: string,
  source = 'source',
  target = 'target'
): WorkflowLink {
  return {
    id,
    source,
    target,
    type: 'control',
    sourceHandleUuid,
    targetHandleUuid
  }
}

const NATIVE_GROUP_REVISION = {
  schema_version: '2',
  revision_id: 'native-group-rev-1',
  workflow_id: 'native-group-demo',
  invocations: [
    {
      node_id: 'phase-group',
      action_ref: 'os_control.group',
      node_type: 'group',
      control: { name: '准备阶段' }
    },
    { node_id: 'prepare', action_ref: 'sampling.prepare' },
    { node_id: 'finish', action_ref: 'sampling.finish' }
  ],
  control_edges: [
    { edge_id: 'e1', source: 'prepare', target: 'finish' }
  ],
  source_map: {
    entries: [
      {
        node_id: 'phase-group',
        compiled_node_ids: ['phase-group', 'prepare']
      }
    ]
  }
}

const NESTED_REVISION = {
  schema_version: '2',
  revision_id: 'nested-rev-1',
  workflow_id: 'nested-demo',
  invocations: [
    {
      node_id: 'outer',
      action_ref: 'os_control.group',
      node_type: 'group',
      control: { name: 'subworkflow::sampling_cycle' }
    },
    { node_id: 'prepare', action_ref: 'sampling.prepare' },
    {
      node_id: 'inner',
      action_ref: 'os_control.group',
      node_type: 'group',
      control: { name: 'subworkflow::sampling_execute' }
    },
    { node_id: 'dose', action_ref: 'sampling.dose' },
    { node_id: 'finish', action_ref: 'sampling.finish' }
  ],
  control_edges: [
    { edge_id: 'e1', source: 'outer', target: 'prepare' },
    { edge_id: 'e2', source: 'prepare', target: 'inner' },
    { edge_id: 'e3', source: 'inner', target: 'dose' },
    { edge_id: 'e4', source: 'outer', target: 'finish' }
  ],
  source_map: {
    entries: [
      {
        node_id: 'outer',
        compiled_node_ids: ['outer', 'prepare', 'inner', 'dose']
      },
      {
        node_id: 'inner',
        compiled_node_ids: ['inner', 'dose']
      }
    ]
  }
}
