import { ServiceError } from '@unilab/services'
import { describe, expect, it } from 'vitest'

import { isWorkflowImportMismatch } from '../utils/workflowImportMismatch'
import { workflowStartFailureMessage } from './usePersistentWorkflowStartFlow'

describe('workflowStartFailureMessage', () => {
  it('does not duplicate an error already presented by the import dialog', () => {
    const error = new ServiceError({
      code: 'workflow_identity_mismatch',
      message: '服务端拒绝跨工作流写入'
    })

    expect(workflowStartFailureMessage(
      error,
      isWorkflowImportMismatch
    )).toBeNull()
  })

  it('keeps unrelated workflow start failures visible', () => {
    expect(workflowStartFailureMessage(
      new Error('网络连接已中断'),
      isWorkflowImportMismatch
    )).toBe('网络连接已中断')
  })
})
