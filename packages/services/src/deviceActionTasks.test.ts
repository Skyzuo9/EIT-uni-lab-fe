import { describe, expect, it } from 'vitest'

import type { HttpClient } from './http'
import { createDeviceActionTaskRuntime } from './deviceActionTasks'

const TASK_UUID = '10000000-0000-4000-8000-000000000001'
const JOB_UUID = '10000000-0000-4000-8000-000000000002'
const TEMPLATE_UUID = '10000000-0000-4000-8000-000000000003'
const IDEMPOTENCY_KEY = '10000000-0000-4000-8000-000000000004'
const FINGERPRINT = `sha256:${'a'.repeat(64)}`

describe('device Action Task service', () => {
  it('posts the frozen public identity and never manufactures Action/source identities', async () => {
    const requests: Array<{ path: string; method?: string; body?: string }> = []
    const runtime = createDeviceActionTaskRuntime(fixtureHttp({
      '/api/v1/device-action-tasks': successEnvelope(taskView())
    }, requests))

    await expect(runtime.createDeviceActionTask({
      authority_id: 'os-local',
      template_catalog_fingerprint: FINGERPRINT,
      workflow_node_template_uuid: TEMPLATE_UUID,
      device_id: 'robot-1',
      input: { duration_seconds: 5 },
      idempotency_key: IDEMPOTENCY_KEY,
      description: '设备页单动作运行'
    })).resolves.toEqual(taskView())

    expect(requests).toEqual([{
      path: '/api/v1/device-action-tasks',
      method: 'POST',
      body: JSON.stringify({
        authority_id: 'os-local',
        template_catalog_fingerprint: FINGERPRINT,
        workflow_node_template_uuid: TEMPLATE_UUID,
        device_id: 'robot-1',
        input: { duration_seconds: 5 },
        idempotency_key: IDEMPOTENCY_KEY,
        description: '设备页单动作运行'
      })
    }])
    expect(requests[0]?.body).not.toContain('action_name')
    expect(requests[0]?.body).not.toContain('workflow_uuid')
  })

  it('rehydrates through the dedicated sanitized REST projection', async () => {
    const requests: Array<{ path: string; method?: string; body?: string }> = []
    const runtime = createDeviceActionTaskRuntime(fixtureHttp({
      [`/api/v1/device-action-tasks/${TASK_UUID}`]: successEnvelope(taskView())
    }, requests))

    const view = await runtime.getDeviceActionTask(TASK_UUID)

    expect(view).toEqual(taskView())
    expect(Object.keys(view)).not.toEqual(expect.arrayContaining([
      'workflow_uuid',
      'workflow_node_uuid',
      'source_revision',
      'source'
    ]))
    expect(requests).toEqual([{
      path: `/api/v1/device-action-tasks/${TASK_UUID}`,
      method: undefined,
      body: undefined
    }])
  })

  it.each([
    ['template_catalog_conflict', 409],
    ['idempotency_conflict', 409],
    ['device_action_mismatch', 409],
    ['unsupported_contract', 422],
    ['admission_unavailable', 503]
  ])('preserves actionable %s errors', async (code, status) => {
    const runtime = createDeviceActionTaskRuntime(fixtureHttp({
      '/api/v1/device-action-tasks': {
        code: status,
        error: { code, message: `error: ${code}` }
      }
    }))

    await expect(runtime.createDeviceActionTask({
      authority_id: 'os-local',
      template_catalog_fingerprint: FINGERPRINT,
      workflow_node_template_uuid: TEMPLATE_UUID,
      device_id: 'robot-1',
      input: {},
      idempotency_key: IDEMPOTENCY_KEY
    })).rejects.toMatchObject({
      code,
      status,
      message: `error: ${code}`
    })
  })

  it('rejects a permissive bare response instead of hiding contract drift', async () => {
    const runtime = createDeviceActionTaskRuntime(fixtureHttp({
      '/api/v1/device-action-tasks': taskView()
    }))

    await expect(runtime.createDeviceActionTask({
      authority_id: 'os-local',
      template_catalog_fingerprint: FINGERPRINT,
      workflow_node_template_uuid: TEMPLATE_UUID,
      device_id: 'robot-1',
      input: {},
      idempotency_key: IDEMPOTENCY_KEY
    })).rejects.toMatchObject({
      code: 'INVALID_DEVICE_ACTION_TASK_RESPONSE'
    })
  })
})

function taskView(): Record<string, unknown> {
  return {
    task_uuid: TASK_UUID,
    job_uuid: JOB_UUID,
    authority_id: 'os-local',
    template_catalog_fingerprint: FINGERPRINT,
    workflow_node_template_uuid: TEMPLATE_UUID,
    action: { name: 'move', display_name: '移动' },
    device_id: 'robot-1',
    status: 'pending',
    control_status: 'active',
    cleanup_status: 'none',
    input: { duration_seconds: 5 },
    output: {},
    error_info: [],
    job: { status: 'pending', feedback_sequence: 0 },
    create_time: '2026-08-02T00:00:00Z',
    update_time: '2026-08-02T00:00:00Z'
  }
}

function successEnvelope(data: unknown): Record<string, unknown> {
  return { code: 0, data }
}

function fixtureHttp(
  responses: Record<string, unknown>,
  requests: Array<{ path: string; method?: string; body?: string }> = []
): HttpClient {
  return {
    request: async <ResponseValue>(
      path: string,
      init?: RequestInit
    ): Promise<ResponseValue> => {
      requests.push({
        path,
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined
      })
      if (!(path in responses)) throw new Error(`Unexpected request: ${path}`)
      return responses[path] as ResponseValue
    }
  }
}
