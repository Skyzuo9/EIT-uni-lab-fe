import { describe, expect, it } from 'vitest'

import {
  createWorkflowIdeSyncState,
  parseWorkflowPackageSource,
  packageSourceUriForResolvedUri,
  reduceWorkflowIdeSync,
  resolveWorkflowPackageSource,
  resolveWorkflowPackageSourceUri,
  synchronizeSavedWorkflowSource,
  workflowIdeMappingStatus,
  workflowNodeAtSourcePosition,
  workflowSourceLocationForNode,
  type WorkflowSourceProjection
} from './index'

const projection: WorkflowSourceProjection = {
  workflowUuid: 'workflow-1',
  sourceUri: 'package://szlab_poly_studio/workflows/s06_robot.py',
  sourceVersion: 'v1',
  mappingAvailable: true,
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
    expect(resolveWorkflowPackageSourceUri(projection.sourceUri, [{
      packageId: 'szlab_poly_studio',
      packageRootUri: 'file:///workspace/szlab_poly_studio',
      editable: true,
      readOnly: false
    }])).toBe('file:///workspace/szlab_poly_studio/workflows/s06_robot.py')
    expect(resolveWorkflowPackageSourceUri(projection.sourceUri, [])).toBeNull()
  })

  it('re-resolves the same package identity after a Workspace move', () => {
    const before = [{
      packageId: 'szlab_poly_studio',
      packageRootUri: 'file:///old/SZLab/szlab_poly_studio',
      editable: true,
      readOnly: false
    }]
    const after = [{
      ...before[0]!,
      packageRootUri: 'file:///moved/SZLab/szlab_poly_studio'
    }]

    expect(resolveWorkflowPackageSourceUri(projection.sourceUri, before))
      .toBe('file:///old/SZLab/szlab_poly_studio/workflows/s06_robot.py')
    expect(resolveWorkflowPackageSourceUri(projection.sourceUri, after))
      .toBe('file:///moved/SZLab/szlab_poly_studio/workflows/s06_robot.py')
    expect(packageSourceUriForResolvedUri(
      'file:///moved/SZLab/szlab_poly_studio/workflows/s06_robot.py',
      after
    )).toBe(projection.sourceUri)
  })

  it('preserves the OS dependency read-only contract with exact navigation', () => {
    const dependency = {
      packageId: 'vendor_protocols',
      packageRootUri: 'file:///deps/vendor_protocols',
      editable: false,
      readOnly: true
    }
    expect(resolveWorkflowPackageSource(
      'package://vendor_protocols/workflows/shared.py',
      [dependency]
    )).toEqual({
      source: { packageId: 'vendor_protocols', relativePath: 'workflows/shared.py' },
      mount: dependency
    })
  })

  it('maps only the current exact tab and restores mapping after close and reopen', () => {
    const sourceUri = 'file:///workspace/workflows/s06_robot.py'
    let state = reduceWorkflowIdeSync(createWorkflowIdeSyncState(), {
      type: 'source-projection-changed',
      projection,
      resolvedSourceUri: sourceUri
    })
    state = reduceWorkflowIdeSync(state, {
      type: 'editor-changed',
      currentUri: 'file:///workspace/notes.py',
      dirty: false,
      cursor: { line: 19, column: 8 }
    })
    expect(state.sourcePosition).toBeNull()
    state = reduceWorkflowIdeSync(state, {
      type: 'editor-changed',
      currentUri: null,
      dirty: false,
      cursor: null
    })
    expect(state.sourcePosition).toBeNull()
    state = reduceWorkflowIdeSync(state, {
      type: 'editor-changed',
      currentUri: sourceUri,
      dirty: false,
      cursor: { line: 19, column: 8 }
    })
    expect(state.sourcePosition).toEqual({ line: 19, column: 8 })
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

  it('keeps navigation paused when the source file is known but its map is not', () => {
    const resolvedSourceUri = 'file:///workspace/workflows/s06_robot.py'
    const state = reduceWorkflowIdeSync(createWorkflowIdeSyncState(), {
      type: 'source-projection-changed',
      projection: {
        ...projection,
        sourceMap: [],
        mappingAvailable: false
      },
      resolvedSourceUri
    })

    expect(workflowIdeMappingStatus(state)).toBe(
      'paused: waiting for OS source map'
    )
    expect(state.sourcePosition).toBeNull()
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
