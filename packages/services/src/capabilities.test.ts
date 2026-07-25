import { describe, expect, it } from 'vitest'

import { getDefaultBackend } from './backends'
import {
  SERVER_CAPABILITY_KEYS,
  getCapabilityStatus,
  hasServerCapability,
  resolveServerCapabilities
} from './capabilities'
import {
  UnsupportedCapabilityError,
  assertCapability
} from './errors'

describe('server capability matrix', () => {
  it.each(['local-go', 'local-python', 'cloud'])(
    'declares only verified target-contract features for %s',
    (backendId) => {
      const backend = getDefaultBackend(backendId)
      const capabilities = resolveServerCapabilities(backend)

      for (const capability of SERVER_CAPABILITY_KEYS) {
        const expected =
          backendId === 'local-go' &&
          capability === 'material.readTemplates'
        expect(hasServerCapability(capabilities, capability)).toBe(expected)

        const status = getCapabilityStatus(
          backend,
          capabilities,
          capability
        )
        expect(status.available).toBe(expected)
        expect(status.reason == null).toBe(expected)
      }
    }
  )

  it('denies unknown profiles by default', () => {
    const backend = { id: 'custom', name: 'Custom server' }
    const capabilities = resolveServerCapabilities(backend)

    expect(capabilities.material.readGraph).toBe(false)
    expect(
      getCapabilityStatus(
        backend,
        capabilities,
        'material.readGraph'
      ).reason
    ).toContain('尚未声明')
  })

  it('throws one typed error for defensive action checks', () => {
    const backend = getDefaultBackend('local-python')
    const capabilities = resolveServerCapabilities(backend)
    const status = getCapabilityStatus(
      backend,
      capabilities,
      'realtime.setJointState'
    )

    expect(() =>
      assertCapability(status, 'realtime.setJointState')
    ).toThrow(UnsupportedCapabilityError)

    try {
      assertCapability(status, 'realtime.setJointState')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'UNSUPPORTED_CAPABILITY',
        capability: 'realtime.setJointState',
        retryable: false
      })
    }
  })
})
