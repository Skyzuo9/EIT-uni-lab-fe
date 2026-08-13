import { describe, expect, it } from 'vitest'

import { ServiceError } from './errors'
import { strictRuntimeData } from './workflowRuntimeCodec'

describe('workflow business error envelopes', () => {
  it('preserves the OS business error for Runtime requests', async () => {
    const code = 1000
    const message = '提交内容格式不正确'
    let thrown: unknown
    try {
      strictRuntimeData({ code, error: { msg: message } })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ServiceError)
    expect(thrown).toMatchObject({
      code: `OS_${code}`,
      message,
      retryable: false
    })
  })
})
