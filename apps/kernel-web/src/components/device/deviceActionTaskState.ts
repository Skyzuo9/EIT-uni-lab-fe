import type { WorkflowNodeJobFeedback } from '@unilab/services'

import type { DeviceActionRunState } from './DevicePanelSupport'

export interface DeviceActionRunOperation {
  actionRef: string
  state: DeviceActionRunState
}

export interface DeviceActionRunAttempt {
  signature: string
  idempotencyKey: string
}

export interface DeviceActionFeedbackState {
  cursor: number
  items: WorkflowNodeJobFeedback[]
}
