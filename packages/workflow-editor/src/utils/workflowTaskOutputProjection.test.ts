import type {
  WorkflowNodeJob,
  WorkflowNodeJobFeedback
} from '@unilab/services'
import { describe, expect, it } from 'vitest'

import {
  projectWorkflowTaskEvents,
  projectWorkflowTaskJob
} from './workflowTaskOutputProjection'

const job: WorkflowNodeJob = {
  uuid: 'job-transfer',
  create_time: '2026-08-03T06:00:00Z',
  update_time: '2026-08-03T06:00:03Z',
  meta_data: {},
  workflow_task_uuid: 'task-1',
  workflow_node_uuid: 'transfer',
  feedback_sequence: 0,
  topological_index: 1,
  executor_kind: 'action',
  execution_policy: {},
  execution_timeout_seconds: 60,
  status: 'succeeded',
  attempt: 1,
  param: { source: 'tube-a', target: 'plate-a' },
  feedback_data: {},
  return_info: { completed: true, transferred_ul: 50 },
  control_data: {},
  error_info: [],
  started_at: '2026-08-03T06:00:01Z',
  finished_at: '2026-08-03T06:00:03Z'
}

/**
 * 注册工作流任务（WorkflowTask）输出投影测试。
 *
 * @returns 无。
 * @throws 作业或反馈证据丢失时由 Vitest 报告。
 */
function registerWorkflowTaskOutputProjectionTests(): void {
  it('keeps complete Job dispatch, result, and timing evidence', () => {
    expect(projectWorkflowTaskJob(job).result).toMatchObject({
      param: { source: 'tube-a', target: 'plate-a' },
      return_info: { completed: true, transferred_ul: 50 },
      create_time: '2026-08-03T06:00:00Z',
      update_time: '2026-08-03T06:00:03Z',
      started_at: '2026-08-03T06:00:01Z',
      finished_at: '2026-08-03T06:00:03Z'
    })
  })

  /**
   * 参数：一个权威作业反馈与对应作业。返回：无；断言投影保留序号、节点和载荷。
   * 异常：若输出重新依赖尚不存在的任务级事件页面，测试失败。
   */
  it('projects authoritative per-Job feedback without a Task event page', () => {
    const feedback: WorkflowNodeJobFeedback = {
      uuid: 'feedback-3',
      create_time: '2026-08-03T06:00:02Z',
      update_time: '2026-08-03T06:00:02Z',
      meta_data: {},
      workflow_node_job_uuid: job.uuid,
      sequence: 3,
      feedback_type: 'progress',
      data: { percent: 50 },
      observed_at: '2026-08-03T06:00:02Z',
      received_at: '2026-08-03T06:00:02Z',
      idempotency_key: 'feedback-3'
    }

    expect(projectWorkflowTaskEvents([feedback], [job])).toEqual([
      {
        key: 'feedback-feedback-3',
        seq: 3,
        type: 'node.feedback',
        nodeId: 'transfer',
        detail: {
          feedback_type: 'progress',
          feedback: { percent: 50 },
          observed_at: '2026-08-03T06:00:02Z',
          received_at: '2026-08-03T06:00:02Z'
        }
      }
    ])
  })
}

describe(
  '工作流任务（WorkflowTask）输出投影',
  registerWorkflowTaskOutputProjectionTests
)
