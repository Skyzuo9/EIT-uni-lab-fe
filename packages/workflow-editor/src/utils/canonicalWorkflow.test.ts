import { describe, expect, it } from 'vitest'

import {
  CONTROL_DAG_JSON,
  CONTROL_DAG_REVISION,
  createWorkflowExecutionScope,
  parseCanonicalWorkflow,
  remapWorkflowBreakpoints,
  remapWorkflowNodeId
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
    expect(parsed.error).toContain('Canonical WorkflowRevision v2')
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
})
