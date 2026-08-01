import { describe, expect, it } from 'vitest'

import type { WorkflowAuthoringGraph } from '@unilab/services'

import {
  parseWorkflowAuthoringGraphImport,
  projectPersistentAuthoringGraph,
  updatePersistentAuthoringNodeName
} from './persistentAuthoringGraph'

const graph: WorkflowAuthoringGraph = {
  workflow: { uuid: 'workflow-1', revision: 7 },
  nodes: [
    { uuid: 'node-1', name: 'prepared', param: {} },
    { uuid: 'node-2', name: 'analyzed', param: {} }
  ],
  edges: [],
  node_templates: [],
  handle_templates: []
}

describe('persistent Authoring canvas graph edits', () => {
  it('projects real Handle UUIDs into ReactFlow nodes and edges', () => {
    const projected = projectPersistentAuthoringGraph({
      ...graph,
      nodes: [
        {
          uuid: 'node-1',
          name: 'prepared',
          workflow_node_template_uuid: 'template-1',
          param: {}
        },
        {
          uuid: 'node-2',
          name: 'analyzed',
          workflow_node_template_uuid: 'template-2',
          param: {}
        }
      ],
      node_templates: [
        { uuid: 'template-1', name: 'source', type: 'action' },
        { uuid: 'template-2', name: 'target', type: 'action' }
      ],
      handle_templates: [
        {
          uuid: 'source-handle',
          workflow_node_template_uuid: 'template-1',
          handle_key: 'sample',
          display_name: '样品输出',
          io_type: 'source'
        },
        {
          uuid: 'target-handle',
          workflow_node_template_uuid: 'template-2',
          handle_key: 'sample',
          display_name: '样品输入',
          io_type: 'target'
        }
      ],
      edges: [{
        uuid: 'edge-1',
        source_node_uuid: 'node-1',
        source_handle_uuid: 'source-handle',
        target_node_uuid: 'node-2',
        target_handle_uuid: 'target-handle',
        meta_data: {}
      }]
    })

    expect(projected.nodes[0]?.handles).toEqual([
      expect.objectContaining({ uuid: 'source-handle', ioType: 'source' })
    ])
    expect(projected.nodes[1]?.handles).toEqual([
      expect.objectContaining({ uuid: 'target-handle', ioType: 'target' })
    ])
    expect(projected.links).toEqual([
      expect.objectContaining({
        sourceHandleUuid: 'source-handle',
        targetHandleUuid: 'target-handle'
      })
    ])
  })

  it('creates an immutable, Python-representable node rename', () => {
    const updated = updatePersistentAuthoringNodeName(
      graph,
      'node-1',
      'prepared_canvas'
    )

    expect(updated).not.toBe(graph)
    expect(updated.nodes[0]).not.toBe(graph.nodes[0])
    expect(updated.nodes[0]?.name).toBe('prepared_canvas')
    expect(updated.nodes[1]).toBe(graph.nodes[1])
    expect(graph.nodes[0]?.name).toBe('prepared')
  })

  it.each(['', 'not valid', '9starts_with_number', 'already-used'])(
    'rejects a node name that cannot safely round-trip: %s',
    (name) => {
      const source = name === 'already-used'
        ? {
            ...graph,
            nodes: graph.nodes.map((node, index) => index === 1
              ? { ...node, name: 'already-used' }
              : node)
          }
        : graph
      expect(() => updatePersistentAuthoringNodeName(source, 'node-1', name))
        .toThrow()
    }
  )
})

describe('persistent Authoring Graph file import', () => {
  it('accepts a raw graph for the current Workflow', () => {
    expect(parseWorkflowAuthoringGraphImport(
      JSON.stringify(graph),
      'workflow-1'
    )).toEqual(graph)
  })

  it('prefers the server Candidate graph in an Authoring aggregate', () => {
    const candidateGraph = {
      ...graph,
      nodes: graph.nodes.map((node, index) => index === 0
        ? { ...node, name: 'candidate_node' }
        : node)
    }
    const appliedGraph = {
      ...graph,
      nodes: graph.nodes.map((node, index) => index === 0
        ? { ...node, name: 'applied_node' }
        : node)
    }

    const imported = parseWorkflowAuthoringGraphImport(JSON.stringify({
      data: {
        candidate: { graph: candidateGraph },
        applied_graph: appliedGraph
      }
    }), 'workflow-1')

    expect(imported.nodes[0]?.name).toBe('candidate_node')
  })

  it('rejects malformed and unsupported Canonical/Cloud JSON', () => {
    expect(() => parseWorkflowAuthoringGraphImport('{', 'workflow-1'))
      .toThrow('JSON 文件无法解析，请检查文件格式')
    expect(() => parseWorkflowAuthoringGraphImport(JSON.stringify({
      schemaVersion: 2,
      workflow: { nodes: [] }
    }), 'workflow-1')).toThrow(
      '当前持久 Authoring 只接受 OS WorkflowAuthoringGraph 导出'
    )
  })

  it('rejects a graph owned by another Workflow', () => {
    expect(() => parseWorkflowAuthoringGraphImport(
      JSON.stringify(graph),
      'workflow-2'
    )).toThrow(
      '导入文件属于 Workflow workflow-1，不能覆盖当前 Workflow workflow-2'
    )
  })
})
