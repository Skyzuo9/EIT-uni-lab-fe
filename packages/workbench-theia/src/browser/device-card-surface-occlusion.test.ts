import { describe, expect, it, vi } from 'vitest'

import { beginDeviceCardSurfaceOcclusion } from './device-card-surface-occlusion'

describe('beginDeviceCardSurfaceOcclusion', () => {
  it('hides the native card surface until the blocking overlay unmounts', async () => {
    const setOccluded = vi.fn().mockResolvedValue(undefined)

    const release = beginDeviceCardSurfaceOcclusion(
      { setOccluded },
      'environment-manager'
    )
    await Promise.resolve()

    expect(setOccluded).toHaveBeenCalledWith('environment-manager', true)

    release()
    await Promise.resolve()

    expect(setOccluded).toHaveBeenLastCalledWith('environment-manager', false)
  })
})
