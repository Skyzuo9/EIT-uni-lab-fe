import { describe, expect, it } from 'vitest'

import {
  CONTROL_DAG_JSON,
  parseCanonicalWorkflow
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
})
