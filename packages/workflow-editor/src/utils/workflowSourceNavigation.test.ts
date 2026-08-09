import { describe, expect, it } from 'vitest'

import type { WorkflowAuthoringAggregate } from '@unilab/services'

import { projectWorkflowSourceNavigation } from './workflowSourceNavigation'

const HASH = `sha256:${'a'.repeat(64)}`

describe('workflow source navigation', () => {
  it('publishes a candidate map after a host-neutral structural clone', () => {
    const sourceMap = [{
      workflow_node_uuid: '22222222-2222-4222-8222-222222222222',
      start_line: 19,
      start_column: 5,
      end_line: 20,
      end_column: 57
    }]
    const aggregate = {
      workflow_uuid: '11111111-1111-4111-8111-111111111111',
      workflow_revision: 2,
      state: 'unapplied_graph',
      applied_graph: emptyGraph(),
      draft: {
        source_uri: 'package://lab/workflows/sample.py',
        python_source: 'result = changed()\n',
        draft_hash: HASH,
        update_time: '2026-08-09T12:57:49Z',
        diagnostics: []
      },
      candidate: {
        base_workflow_revision: 2,
        candidate_hash: `sha256:${'b'.repeat(64)}`,
        changeset: {
          kind: 'graph',
          created_node_uuids: [],
          updated_node_uuids: [],
          deleted_node_uuids: [],
          created_edge_uuids: [],
          updated_edge_uuids: [],
          deleted_edge_uuids: [],
          reserved_metadata_changed: false
        },
        compiler_version: 'test',
        draft_hash: HASH,
        graph: emptyGraph(),
        normalized_python_source: 'result = changed()\n',
        source_map: sourceMap,
        diagnostics: [],
        template_catalog_fingerprint: HASH,
      },
      applied_source: null
    } satisfies WorkflowAuthoringAggregate

    expect(projectWorkflowSourceNavigation(
      aggregate,
      aggregate.workflow_uuid,
      structuredClone(sourceMap)
    )).toEqual({
      workflowUuid: aggregate.workflow_uuid,
      sourceUri: aggregate.draft.source_uri,
      sourceVersion: aggregate.candidate.candidate_hash,
      sourceMap,
      mappingAvailable: true
    })
  })

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
