import { describe, expect, it } from 'vitest'

import { sessionConnectionState } from './workbench-connection-runtime'

describe('Workbench connection runtime projection', () => {
  /** 证明托管 OS 生命周期只投影传输健康，不伪造调度或任务状态。 */
  it('maps managed session phases to connection states', () => {
    expect(sessionConnectionState('ready')).toBe('connected')
    expect(sessionConnectionState('failed')).toBe('error')
    expect(sessionConnectionState('idle')).toBe('disconnected')
    expect(sessionConnectionState('starting')).toBe('connecting')
    expect(sessionConnectionState('waiting')).toBe('connecting')
  })
})
