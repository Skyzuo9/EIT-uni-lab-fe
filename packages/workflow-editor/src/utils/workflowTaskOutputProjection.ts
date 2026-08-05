import type {
  WorkflowNodeJob,
  WorkflowNodeJobFeedback
} from '@unilab/services'

import type {
  WorkflowOutputEvent,
  WorkflowOutputNode
} from '../components/WorkflowOutput'

export function projectWorkflowTaskJob(
  job: WorkflowNodeJob
): WorkflowOutputNode {
  return {
    nodeId: job.uuid,
    sourceNodeId: job.workflow_node_uuid,
    nodeType: job.executor_kind,
    state: job.status,
    attempt: job.attempt,
    result: {
      job_uuid: job.uuid,
      workflow_node_uuid: job.workflow_node_uuid,
      executor_kind: job.executor_kind,
      status: job.status,
      attempt: job.attempt,
      param: job.param,
      feedback_sequence: job.feedback_sequence,
      feedback_data: job.feedback_data,
      return_info: job.return_info,
      error_info: job.error_info,
      create_time: job.create_time,
      update_time: job.update_time,
      started_at: job.started_at,
      finished_at: job.finished_at
    }
  }
}

/**
 * 将权威作业反馈投影为工作流输出事件。
 *
 * @param feedback 作业反馈（WorkflowNodeJobFeedback）的顺序投影。
 * @param jobs 当前工作流任务（WorkflowTask）的作业集合。
 * @returns 以反馈序号排序、关联到源节点的输出事件。
 * @throws 无；找不到作业时保留空节点身份。
 */
export function projectWorkflowTaskEvents(
  feedback: readonly WorkflowNodeJobFeedback[],
  jobs: readonly WorkflowNodeJob[]
): WorkflowOutputEvent[] {
  const sourceNodeByJob = new Map(jobs.map((job) => [
    job.uuid,
    job.workflow_node_uuid
  ]))
  return feedback
    .map((item) => ({
      key: `feedback-${item.uuid}`,
      seq: item.sequence,
      type: 'node.feedback',
      nodeId: sourceNodeByJob.get(item.workflow_node_job_uuid) ?? null,
      detail: {
        feedback_type: item.feedback_type,
        feedback: item.data,
        observed_at: item.observed_at,
        received_at: item.received_at
      }
    }))
    .sort((left, right) => left.seq - right.seq)
}
