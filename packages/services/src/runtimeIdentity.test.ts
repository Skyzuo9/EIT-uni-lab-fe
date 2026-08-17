import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRuntimeUuid } from './runtimeIdentity'

describe('createRuntimeUuid', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses crypto.randomUUID when the secure-context API is available', () => {
    const randomUUID = vi.fn(() => '10000000-0000-4000-8000-000000000001')
    vi.stubGlobal('crypto', { randomUUID })

    expect(createRuntimeUuid()).toBe('10000000-0000-4000-8000-000000000001')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('builds a UUID v4 from getRandomValues in an HTTP context', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0)
        return bytes
      }
    })

    expect(createRuntimeUuid()).toBe('00000000-0000-4000-8000-000000000000')
  })
})
