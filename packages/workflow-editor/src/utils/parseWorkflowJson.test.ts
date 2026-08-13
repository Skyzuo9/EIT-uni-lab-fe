import { describe, expect, it } from 'vitest'

import { migrateCloudWorkflowJson } from './parseWorkflowJson'

describe('Cloud JSON to Canonical v2 migration', () => {
  it('preserves actions, literal parameters, layout and ready control edges', () => {
    const migrated = migrateCloudWorkflowJson(JSON.stringify(cloudWorkflow({
      nodes: [
        cloudNode('first', 12.5, -30, { test_count: 3 }),
        cloudNode('second', 280, -30)
      ],
      edges: [cloudEdge('first', 'ready', 'second', 'ready')]
    })))

    expect(migrated.error).toBeNull()
    expect(migrated.revision).toMatchObject({
      schema_version: '2',
      workflow_id: 'workflow-1',
      invocations: [
        {
          node_id: 'first',
          action_ref: 'host_node.test_latency',
          input_bindings: {
            test_count: { kind: 'literal', value: 3 }
          }
        },
        {
          node_id: 'second',
          action_ref: 'host_node.test_latency',
          input_bindings: {}
        }
      ],
      control_edges: [
        {
          edge_id: 'cloud-edge-1',
          source: 'first',
          target: 'second'
        }
      ],
      data_edges: [],
      layout: {
        nodes: {
          first: { x: 12.5, y: -30 },
          second: { x: 280, y: -30 }
        }
      }
    })
    expect(migrated.revision?.revision_id).toMatch(
      /^cloud-import-[0-9a-f]{16}$/
    )
  })

  it('turns non-ready handles into a matching binding and data edge', () => {
    const migrated = migrateCloudWorkflowJson(JSON.stringify(cloudWorkflow({
      nodes: [cloudNode('measure'), cloudNode('consume')],
      edges: [cloudEdge('measure', 'avg_rtt_ms', 'consume', 'delay')]
    })))

    expect(migrated.error).toBeNull()
    expect(migrated.revision?.invocations[1]?.input_bindings).toEqual({
      delay: {
        kind: 'node_output',
        node_id: 'measure',
        output: 'avg_rtt_ms'
      }
    })
    expect(migrated.revision?.data_edges).toEqual([
      {
        edge_id: 'cloud-edge-1',
        source: 'measure',
        source_output: 'avg_rtt_ms',
        target: 'consume',
        target_input: 'delay'
      }
    ])
  })

  it('rejects Cloud branch-like handles without an explicit branch contract', () => {
    const migrated = migrateCloudWorkflowJson(JSON.stringify(cloudWorkflow({
      nodes: [cloudNode('branch'), cloudNode('yes'), cloudNode('no')],
      edges: [
        cloudEdge('branch', 'true', 'yes', 'ready'),
        cloudEdge('branch', 'false', 'no', 'ready')
      ]
    })))

    expect(migrated.revision).toBeNull()
    expect(migrated.error).toContain('混合了控制 handle 与数据 handle')
  })

  it.each([
    {
      title: 'duplicate node ids',
      mutate: (value: ReturnType<typeof cloudWorkflow>) => {
        value.data.nodes.push(cloudNode('first'))
      },
      error: '重复节点 UUID'
    },
    {
      title: 'disabled nodes',
      mutate: (value: ReturnType<typeof cloudWorkflow>) => {
        value.data.nodes[0]!.disabled = true
      },
      error: '已禁用'
    },
    {
      title: 'dangling edges',
      mutate: (value: ReturnType<typeof cloudWorkflow>) => {
        value.data.edges.push(cloudEdge('first', 'ready', 'missing', 'ready'))
      },
      error: '不存在的节点'
    },
    {
      title: 'ambiguous literal/data inputs',
      mutate: (value: ReturnType<typeof cloudWorkflow>) => {
        value.data.nodes.push(cloudNode('second', 0, 0, { delay: 12 }))
        value.data.edges.push(
          cloudEdge('first', 'avg_rtt_ms', 'second', 'delay')
        )
      },
      error: '同时存在字面量参数和数据连接'
    },
    {
      title: 'cycles',
      mutate: (value: ReturnType<typeof cloudWorkflow>) => {
        value.data.nodes.push(cloudNode('second'))
        value.data.edges.push(cloudEdge('first', 'ready', 'second', 'ready'))
        value.data.edges.push(cloudEdge('second', 'ready', 'first', 'ready'))
      },
      error: '依赖环'
    }
  ])('rejects $title instead of guessing', ({ mutate, error }) => {
    const source = cloudWorkflow({ nodes: [cloudNode('first')], edges: [] })
    mutate(source)

    const migrated = migrateCloudWorkflowJson(JSON.stringify(source))

    expect(migrated.revision).toBeNull()
    expect(migrated.error).toContain(error)
  })
})

function cloudWorkflow({
  nodes,
  edges
}: {
  nodes: Array<ReturnType<typeof cloudNode>>
  edges: Array<ReturnType<typeof cloudEdge>>
}) {
  return {
    name: 'Cloud import fixture',
    target_lab_uuid: 'fixture-lab',
    data: {
      workflow_uuid: 'workflow-1',
      workflow_name: 'Cloud import fixture',
      nodes,
      edges
    }
  }
}

function cloudNode(
  uuid: string,
  x = 0,
  y = 0,
  param: Record<string, unknown> = {}
) {
  return {
    uuid,
    parent_uuid: '',
    name: 'test_latency',
    type: 'ILab',
    pose: { position: { x, y, z: 0 } },
    param,
    lab_node_type: 'Device',
    template_name: 'test_latency',
    device_name: 'host_node',
    disabled: false
  }
}

function cloudEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
) {
  return {
    source_node_uuid: source,
    target_node_uuid: target,
    source_handle_key: sourceHandle,
    source_handle_io: 'source',
    target_handle_key: targetHandle,
    target_handle_io: 'target'
  }
}
