import { describe, expect, it } from 'vitest'

import type { WorkflowAuthoringAggregate } from '@unilab/services'

import { projectWorkflowSourceNavigation } from './workflowSourceNavigation'

const HASH = `sha256:${'a'.repeat(64)}`

describe('workflow source navigation', () => {
  it('keeps the source file bound while its saved draft awaits a source map', () => {
    const aggregate = {
      workflow_uuid: '11111111-1111-4111-8111-111111111111',
      workflow_revision: 2,
      state: 'applied_source_stale',
      applied_graph: emptyGraph(),
      draft: {
        source_uri: 'package://lab/workflows/sample.py',
        python_source: 'result = changed()\n',
        draft_hash: HASH,
        update_time: '2026-08-09T12:57:49Z',
        diagnostics: []
      },
      candidate: null,
      applied_source: null
    } satisfies WorkflowAuthoringAggregate

    expect(projectWorkflowSourceNavigation(
      aggregate,
      aggregate.workflow_uuid,
      []
    )).toEqual({
      workflowUuid: aggregate.workflow_uuid,
      sourceUri: aggregate.draft.source_uri,
      sourceVersion: HASH,
      sourceMap: [],
      mappingAvailable: false
    })
  })
})

function emptyGraph(): WorkflowAuthoringAggregate['applied_graph'] {
  return {
    workflow: {},
    nodes: [],
    edges: [],
    node_templates: [],
    handle_templates: []
  }
}
