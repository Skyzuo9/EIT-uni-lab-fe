import { describe, expect, it } from 'vitest'

import type { HttpClient } from './http'
import { createDeviceActionTaskRuntime } from './deviceActionTasks'

const TASK_UUID = '10000000-0000-4000-8000-000000000001'
const JOB_UUID = '10000000-0000-4000-8000-000000000002'
const TEMPLATE_UUID = '10000000-0000-4000-8000-000000000003'
const IDEMPOTENCY_KEY = '10000000-0000-4000-8000-000000000004'
const MATERIAL_UUID = '10000000-0000-4000-8000-000000000005'

describe('device Action Task service', () => {
  /** 验证设备单动作通过 dev-wt 当前公开入口提交，不再请求已退役路径。 */
  it('posts the Backend-shaped device Action Run request', async () => {
    const requests: Array<{ path: string; method?: string; body?: string }> = []
    const runtime = createDeviceActionTaskRuntime(fixtureHttp({
      '/api/v1/device-action-runs': successEnvelope(actionRunResult())
    }, requests))

    await expect(runtime.createDeviceActionTask({
      material_uuid: MATERIAL_UUID,
      workflow_node_template_uuid: TEMPLATE_UUID,
      param: { duration_seconds: 5 },
      execution_policy: {},
      idempotency_key: IDEMPOTENCY_KEY,
      description: '设备页单动作运行',
      meta_data: {}
    })).resolves.toEqual(taskView())

    expect(requests).toEqual([{
      path: '/api/v1/device-action-runs',
      method: 'POST',
      body: JSON.stringify({
        material_uuid: MATERIAL_UUID,
        workflow_node_template_uuid: TEMPLATE_UUID,
        param: { duration_seconds: 5 },
        execution_policy: {},
        idempotency_key: IDEMPOTENCY_KEY,
        description: '设备页单动作运行',
        meta_data: {}
      })
    }])
    expect(requests[0]?.body).not.toContain('authority_id')
    expect(requests[0]?.body).not.toContain('device_id')
  })

  /** 验证刷新后通过标准任务与作业资源恢复设备单动作状态。 */
  it('rehydrates through the standard task and job resources', async () => {
    const requests: Array<{ path: string; method?: string; body?: string }> = []
    const runtime = createDeviceActionTaskRuntime(fixtureHttp({
      [`/api/v1/workflow-tasks/${TASK_UUID}`]: successEnvelope(actionTask()),
      [`/api/v1/workflow-tasks/${TASK_UUID}/jobs`]: successEnvelope([actionJob()])
    }, requests))

    const view = await runtime.getDeviceActionTask(TASK_UUID)

    expect(view).toEqual(taskView())
    expect(Object.keys(view)).not.toEqual(expect.arrayContaining([
      'workflow_uuid',
      'workflow_node_uuid',
      'source_revision',
      'source'
    ]))
    expect(requests).toEqual([
      {
        path: `/api/v1/workflow-tasks/${TASK_UUID}`,
        method: undefined,
        body: undefined
      },
      {
        path: `/api/v1/workflow-tasks/${TASK_UUID}/jobs`,
        method: undefined,
        body: undefined
      }
    ])
  })

  it.each([
    [1000, false, '引用的设备不存在或不可用'],
    [5001, true, '本地设备运行信息尚未就绪']
  ])('preserves Backend error %s as an actionable message', async (
    businessCode,
    retryable,
    message
  ) => {
    const runtime = createDeviceActionTaskRuntime(fixtureHttp({
      '/api/v1/device-action-runs': {
        code: businessCode,
        error: { msg: message }
      }
    }))

    await expect(runtime.createDeviceActionTask({
      material_uuid: MATERIAL_UUID,
      workflow_node_template_uuid: TEMPLATE_UUID,
      param: {},
      idempotency_key: IDEMPOTENCY_KEY
    })).rejects.toMatchObject({
      code: `DEVICE_ACTION_RUN_REJECTED_${businessCode}`,
      retryable,
      message
    })
  })

  it('rejects a permissive bare response instead of hiding contract drift', async () => {
    const runtime = createDeviceActionTaskRuntime(fixtureHttp({
      '/api/v1/device-action-runs': actionRunResult()
    }))

    await expect(runtime.createDeviceActionTask({
      material_uuid: MATERIAL_UUID,
      workflow_node_template_uuid: TEMPLATE_UUID,
      param: {},
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
    status: 'pending',
    control_status: 'active',
    cleanup_status: 'none',
    output: {},
    error_info: [],
    job_status: 'pending',
    feedback_cursor: 0
  }
}

/** 构造 dev-wt 当前设备单动作创建接口的标准任务与作业结果。 */
function actionRunResult(): Record<string, unknown> {
  return {
    task: actionTask(),
    job: actionJob(),
    created: true
  }
}

/** 构造标准工作流任务（WorkflowTask）资源。 */
function actionTask(): Record<string, unknown> {
  return {
    uuid: TASK_UUID,
    status: 'pending',
    control_status: 'active',
    cleanup_status: 'none',
    output: {},
    error_info: [],
    create_time: '2026-08-02T00:00:00Z',
    update_time: '2026-08-02T00:00:00Z',
    started_at: null,
    finished_at: null
  }
}

/** 构造设备单动作对应的唯一工作流节点作业（WorkflowNodeJob）。 */
function actionJob(): Record<string, unknown> {
  return {
    uuid: JOB_UUID,
    workflow_task_uuid: TASK_UUID,
    status: 'pending',
    param: { duration_seconds: 5 },
    return_info: {},
    error_info: [],
    feedback_sequence: 0,
    create_time: '2026-08-02T00:00:00Z',
    update_time: '2026-08-02T00:00:00Z',
    started_at: null,
    finished_at: null
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
