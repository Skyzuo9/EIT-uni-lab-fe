import { describe, expect, it } from 'vitest'

import type { WorkflowAuthoringGraph } from '@unilab/services'

import {
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
