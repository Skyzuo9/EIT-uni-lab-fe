import { describe, expect, it } from 'vitest'

import {
  createWorkflowIdeSyncState,
  parseWorkflowPackageSource,
  reduceWorkflowIdeSync,
  synchronizeSavedWorkflowSource,
  workflowIdeMappingStatus,
  workflowNodeAtSourcePosition,
  workflowPackageCandidatePaths,
  workflowSourceLocationForNode,
  type WorkflowSourceProjection
} from './index'

const projection: WorkflowSourceProjection = {
  workflowUuid: 'workflow-1',
  sourceUri: 'package://szlab_poly_studio/workflows/s06_robot.py',
  sourceVersion: 'v1',
  sourceMap: [{
    workflow_node_uuid: 'node-1',
    start_line: 19,
    start_column: 5,
    end_line: 20,
    end_column: 57
  }]
}

describe('workflow IDE bridge', () => {
  it('maps nodes and source positions using the same OS projection', () => {
    expect(workflowSourceLocationForNode(projection, 'node-1')).toMatchObject({
      sourceUri: projection.sourceUri,
      line: 19,
      column: 5
    })
    expect(workflowNodeAtSourcePosition(projection.sourceMap, {
      line: 19,
      column: 8
    })).toBe('node-1')
  })

  it('parses package identity without binding to a host filesystem API', () => {
    expect(parseWorkflowPackageSource(projection.sourceUri)).toEqual({
      packageId: 'szlab_poly_studio',
      relativePath: 'workflows/s06_robot.py'
    })
    expect(parseWorkflowPackageSource('package://pkg/../secret')).toBeNull()
    expect(workflowPackageCandidatePaths(projection.sourceUri)).toEqual([
      'szlab_poly_studio/workflows/s06_robot.py',
      'workflows/s06_robot.py'
    ])
  })

  it('pauses after edits until OS publishes a new source version', () => {
    const resolvedSourceUri = 'file:///workspace/workflows/s06_robot.py'
    let state = reduceWorkflowIdeSync(createWorkflowIdeSyncState(), {
      type: 'source-projection-changed',
      projection,
      resolvedSourceUri
    })
    state = reduceWorkflowIdeSync(state, {
      type: 'editor-changed',
      currentUri: resolvedSourceUri,
      dirty: true,
      cursor: { line: 19, column: 5 }
    })
    expect(workflowIdeMappingStatus(state)).toBe('paused: unsaved file')

    state = reduceWorkflowIdeSync(state, {
      type: 'editor-changed',
      currentUri: resolvedSourceUri,
      dirty: false,
      cursor: { line: 19, column: 5 }
    })
    expect(workflowIdeMappingStatus(state)).toBe(
      'paused: waiting for OS source map'
    )
    state = reduceWorkflowIdeSync(state, {
      type: 'source-projection-changed',
      projection: { ...projection, sourceVersion: 'v2' },
      resolvedSourceUri
    })
    expect(workflowIdeMappingStatus(state)).toBe('active')
    expect(state.sourcePosition).toEqual({ line: 19, column: 5 })
  })

  it('recompiles an IDE-saved file with the hash OS just observed', async () => {
    const writes: unknown[] = []
    const result = await synchronizeSavedWorkflowSource({
      getWorkflowAuthoring: async () => ({
        workflow_revision: 7,
        draft: { python_source: 'value = 2\n', draft_hash: 'draft-v2' }
      }),
      saveWorkflowAuthoringDraft: async (workflowUuid, request) => {
        writes.push({ workflowUuid, request })
        return {
          workflow_revision: 7,
          draft: { python_source: 'value = 2\n', draft_hash: 'draft-v2' },
          candidate: {
            draft_hash: 'draft-v2',
            normalized_python_source: 'value = 2\n'
          }
        }
      }
    }, 'workflow-1', 'value = 2\n')

    expect(result).toBe('compiled')
    expect(writes).toEqual([{
      workflowUuid: 'workflow-1',
      request: {
        python_source: 'value = 2\n',
        expected_draft_hash: 'draft-v2',
        expected_workflow_revision: 7
      }
    }])
  })

  it('materializes OS-normalized source so its source map matches the IDE file', async () => {
    const writes: unknown[] = []
    const snapshots = [{
      workflow_revision: 7,
      draft: { python_source: 'value=2\n', draft_hash: 'draft-raw' },
      candidate: {
        draft_hash: 'draft-raw',
        normalized_python_source: 'value = 2\n'
      }
    }, {
      workflow_revision: 7,
      draft: { python_source: 'value = 2\n', draft_hash: 'draft-normalized' },
      candidate: {
        draft_hash: 'draft-normalized',
        normalized_python_source: 'value = 2\n'
      }
    }]
    const result = await synchronizeSavedWorkflowSource({
      getWorkflowAuthoring: async () => ({
        workflow_revision: 7,
        draft: { python_source: 'value=2\n', draft_hash: 'draft-raw' }
      }),
      saveWorkflowAuthoringDraft: async (workflowUuid, request) => {
        writes.push({ workflowUuid, request })
        return snapshots.shift()!
      }
    }, 'workflow-1', 'value=2\n')

    expect(result).toBe('normalized')
    expect(writes).toEqual([
      {
        workflowUuid: 'workflow-1',
        request: {
          python_source: 'value=2\n',
          expected_draft_hash: 'draft-raw',
          expected_workflow_revision: 7
        }
      },
      {
        workflowUuid: 'workflow-1',
        request: {
          python_source: 'value = 2\n',
          expected_draft_hash: 'draft-raw',
          expected_workflow_revision: 7
        }
      }
    ])
  })

  it('never overwrites a source changed again after the IDE save', async () => {
    let wrote = false
    const result = await synchronizeSavedWorkflowSource({
      getWorkflowAuthoring: async () => ({
        workflow_revision: 7,
        draft: { python_source: 'external = 3\n', draft_hash: 'draft-v3' }
      }),
      saveWorkflowAuthoringDraft: async () => {
        wrote = true
        throw new Error('must not write')
      }
    }, 'workflow-1', 'value = 2\n')

    expect(result).toBe('source-changed')
    expect(wrote).toBe(false)
  })
})
