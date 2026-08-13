import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BACKEND_ENABLED,
  shouldShowConnectionRecovery
} from './connectionPolicy'

describe('backend connection policy', () => {
  it('connects the default Edge profile automatically', () => {
    expect(DEFAULT_BACKEND_ENABLED).toBe(true)
  })

  it('only shows connection recovery after a failed probe', () => {
    expect(shouldShowConnectionRecovery(true, 'disconnected')).toBe(false)
    expect(shouldShowConnectionRecovery(true, 'connecting')).toBe(false)
    expect(shouldShowConnectionRecovery(true, 'connected')).toBe(false)
    expect(shouldShowConnectionRecovery(true, 'error')).toBe(true)
    expect(shouldShowConnectionRecovery(false, 'error')).toBe(false)
  })
})
