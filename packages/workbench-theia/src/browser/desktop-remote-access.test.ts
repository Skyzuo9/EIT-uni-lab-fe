import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  desktopWorkbenchRemoteApi,
  type DesktopWorkbenchRemoteApi
} from './desktop-remote-access'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('desktopWorkbenchRemoteApi', () => {
  it('is unavailable to an ordinary remote browser renderer', () => {
    vi.stubGlobal('window', {})

    expect(desktopWorkbenchRemoteApi()).toBeNull()
  })

  it('returns only the privileged Electron preload bridge', async () => {
    const snapshot = {
      phase: 'idle' as const,
      origin: null,
      accessUrl: null,
      pid: null,
      generation: null,
      expiresAt: null,
      error: null
    }
    const api: DesktopWorkbenchRemoteApi = {
      getSnapshot: vi.fn(async () => snapshot),
      start: vi.fn(async () => snapshot),
      stop: vi.fn(async () => snapshot)
    }
    vi.stubGlobal('window', { api: { workbenchRemote: api } })

    expect(desktopWorkbenchRemoteApi()).toBe(api)
    await expect(desktopWorkbenchRemoteApi()?.getSnapshot()).resolves.toEqual(
      snapshot
    )
  })
})
