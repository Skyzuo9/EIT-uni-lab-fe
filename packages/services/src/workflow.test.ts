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

describe('workflow runtime port', () => {
  it('submits the complete immutable revision and debug settings', async () => {
    const request = vi.fn().mockResolvedValue({
      id: 'run-1',
      status: 'pending',
      workflowRevisionHash: 'hash-1'
    })
    const runtime = createWorkflowRuntime(mockHttp(request), getDefaultBackend('local-python'))

    await expect(runtime.createRun({
      source: {
        format: 'workflow_revision_v2',
        revision
      },
      debug: {
        pause_on_start: true,
        breakpoints: ['branch'],
        start_node_id: 'branch'
      }
    })).resolves.toMatchObject({ id: 'run-1' })

    expect(request).toHaveBeenCalledWith(
      '/api/v1/runtime/runs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source: {
            format: 'workflow_revision_v2',
            revision
          },
          debug: {
            pause_on_start: true,
            breakpoints: ['branch'],
            start_node_id: 'branch'
          }
        })
      })
    )
  })

  it('uses one command endpoint and then refreshes authoritative run state', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        debug: { status: 'stepping' }
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        status: 'running',
        debug: { enabled: true, status: 'paused' }
      })
    const runtime = createWorkflowRuntime(mockHttp(request), getDefaultBackend('local-python'))

    const result = await runtime.command('run-1', 'step_over')

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/runtime/runs/run-1/commands',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'step_over', payload: {} })
      })
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v1/runtime/runs/run-1',
      undefined
    )
    expect(result.debug?.status).toBe('paused')
  })

  it('preserves monotonic event cursor from the unified page', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        events: [
          {
            seq: 9,
            runId: 'run-1',
            type: 'node.result',
            nodeId: 'yes',
            timestamp: 1,
            payload: {}
          }
        ],
        nextSeq: 9
      }
    })
    const runtime = createWorkflowRuntime(mockHttp(request), getDefaultBackend('local-python'))

    const page = await runtime.listRunEvents('run-1', 8)

    expect(page.nextSeq).toBe(9)
    expect(page.events[0]?.type).toBe('node.result')
    expect(request).toHaveBeenCalledWith(
      '/api/v1/runtime/runs/run-1/events?after_seq=8',
      undefined
    )
  })

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
