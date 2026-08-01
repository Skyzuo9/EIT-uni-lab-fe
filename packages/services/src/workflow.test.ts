import { describe, expect, it, vi } from 'vitest'

import { getDefaultBackend } from './backends'
import type { HttpClient } from './http'
import {
  createWorkflowRuntime,
  type WorkflowRevision
} from './workflow'

const revision: WorkflowRevision = {
  schema_version: '2',
  revision_id: 'rev-1',
  workflow_id: 'wf-1',
  invocations: [
    { node_id: 'branch', action_ref: 'os_control.branch', node_type: 'branch' },
    { node_id: 'yes', action_ref: 'pump-1.dose' },
    { node_id: 'no', action_ref: 'camera-1.inspect' }
  ],
  control_edges: [
    { source: 'branch', target: 'yes', branch: 'true' },
    { source: 'branch', target: 'no', branch: 'false' }
  ]
}

describe('workflow authoring adapters', () => {
  it('uses the OS authoring boundary for JSON and Python conversion', async () => {
    const candidate = {
      revision_id: 'authoring-code-1',
      parent_revision_id: 'rev-1',
      canonical_ir: revision,
      python_source: 'pump.dose(volume=5)',
      diagnostics: []
    }
    const request = vi.fn()
      .mockResolvedValueOnce({
        base_revision_id: 'rev-1',
        candidate,
        diagnostics: []
      })
      .mockResolvedValueOnce({
        base_revision_id: 'rev-1',
        candidate,
        diagnostics: []
      })
      .mockResolvedValueOnce({
        base_revision_id: 'rev-1',
        candidate,
        diagnostics: []
      })
    const runtime = createWorkflowRuntime(
      mockHttp(request),
      getDefaultBackend('local-python')
    )

    await runtime.generatePythonWorkflow(
      'rev-1',
      revision,
      'workflows/wf-1.py'
    )
    await runtime.compilePythonWorkflow(
      'rev-1',
      candidate.python_source,
      'workflows/wf-1.py'
    )
    await runtime.validateAuthoringCandidate('rev-1', candidate)

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/authoring/generate-python',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          base_revision_id: 'rev-1',
          canonical_ir: revision,
          source_uri: 'workflows/wf-1.py'
        })
      })
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v1/authoring/compile',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          base_revision_id: 'rev-1',
          python_source: candidate.python_source,
          source_uri: 'workflows/wf-1.py'
        })
      })
    )
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/api/v1/authoring/validate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          base_revision_id: 'rev-1',
          candidate
        })
      })
    )
  })
})

function mockHttp(
  request: ReturnType<typeof vi.fn>
): HttpClient {
  return {
    request: async <ResponseValue>(
      path: string,
      init?: RequestInit
    ): Promise<ResponseValue> =>
      request(path, init) as Promise<ResponseValue>
  }
}
