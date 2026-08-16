import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

import { dispatchDeviceCardManualExclusive } from './deviceCardManualExclusiveDispatch'

const liveContext = {
  mode: 'live' as const,
  device: {
    deviceId: 'robot-01',
    deviceTypeId: 'community.ptlc_station.robot',
    title: 'Robot'
  },
  state: {},
  config: {},
  theme: 'light' as const,
  locale: 'zh-CN'
}

describe('卡片手动独占（Exclusive）分发', () => {
  it('只向主渲染进程发送设备身份和操作', async () => {
    const send = vi.fn()
    let resolvePending: ((result: {
      requestId: string
      ok: boolean
      snapshot?: {
        localDeviceId: string
        state: 'exclusive'
        exclusive: true
      }
    }) => void) | undefined
    const resultPromise = dispatchDeviceCardManualExclusive({
      context: liveContext,
      uiFeatures: ['core', 'manual-exclusive'],
      operation: 'acquire',
      window: { webContents: { send } } as unknown as BrowserWindow,
      registerPending: (_requestId, resolve) => { resolvePending = resolve }
    })
    const request = send.mock.calls[0]?.[1]
    expect(send.mock.calls[0]?.[0]).toBe('device-cards:manualExclusiveRequest')
    expect(request).toMatchObject({ deviceId: 'robot-01', operation: 'acquire' })
    resolvePending?.({
      requestId: request.requestId,
      ok: true,
      snapshot: {
        localDeviceId: 'robot-01',
        state: 'exclusive',
        exclusive: true
      }
    })
    await expect(resultPromise).resolves.toMatchObject({ ok: true })
  })

  it('Mock 或未声明 UI Feature 时关闭式拒绝', async () => {
    const window = { webContents: { send: vi.fn() } } as unknown as BrowserWindow
    await expect(dispatchDeviceCardManualExclusive({
      context: { ...liveContext, mode: 'mock' },
      uiFeatures: ['core', 'manual-exclusive'],
      operation: 'read',
      window,
      registerPending: vi.fn()
    })).resolves.toMatchObject({ ok: false })
    await expect(dispatchDeviceCardManualExclusive({
      context: liveContext,
      uiFeatures: ['core'],
      operation: 'read',
      window,
      registerPending: vi.fn()
    })).resolves.toMatchObject({ ok: false })
    expect(window.webContents.send).not.toHaveBeenCalled()
  })
})
