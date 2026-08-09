import { describe, expect, it } from 'vitest'

import { isProtectedAgentRequest } from './agent-sidecar'

describe('Workbench Agent private-state boundary', () => {
  it('rejects direct, encoded and traversal access to .unilabos', () => {
    expect(isProtectedAgentRequest('/api/files?path=../.unilabos/agent/aionui')).toBe(true)
    expect(isProtectedAgentRequest('/api/files?path=..%2F.unilabos%2Fsession.json')).toBe(true)
    expect(isProtectedAgentRequest('/api/files?path=%252Eunilabos%252Fsession.json')).toBe(true)
    expect(isProtectedAgentRequest('/api/files?path=.unilabos/session.json')).toBe(true)
    expect(isProtectedAgentRequest('/api/files', JSON.stringify({ path: '.unilabos/logs' }))).toBe(true)
    expect(isProtectedAgentRequest('/api/files', '{"path":"\\u002eunilabos/logs"}')).toBe(true)
  })

  it('allows ordinary Editable Package files and provider/session APIs', () => {
    expect(isProtectedAgentRequest('/api/files?path=workflows/s06_robot.py')).toBe(false)
    expect(isProtectedAgentRequest('/api/conversations', '{"provider":"codex"}')).toBe(false)
  })
})
