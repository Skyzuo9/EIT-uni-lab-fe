import { contextBridge, ipcRenderer } from 'electron'

import type {
  DeviceCardActionRun,
  DeviceCardBridge,
  DeviceCardHostManualExclusiveResult,
  DeviceCardManualExclusiveSnapshot,
  DeviceCardRuntimeSnapshot,
  JsonObject
} from '@unilab/device-card-sdk'

interface StateSubscription {
  keys: Set<string>
  listener: (state: Record<string, unknown>) => void
}

const subscriptions = new Set<StateSubscription>()
let currentState: Record<string, unknown> = {}

ipcRenderer.on(
  'device-card:state',
  (_event, nextState: Record<string, unknown>) => {
    currentState = { ...nextState }
    for (const subscription of subscriptions) {
      subscription.listener(filterState(currentState, subscription.keys))
    }
  }
)

const bridge: DeviceCardBridge = {
  getContext: async (): Promise<DeviceCardRuntimeSnapshot> => {
    const context = await ipcRenderer.invoke(
      'device-card-runtime:getContext'
    ) as DeviceCardRuntimeSnapshot
    currentState = { ...context.state }
    return context
  },
  subscribeState: (keys, listener) => {
    const subscription = { keys: new Set(keys), listener }
    subscriptions.add(subscription)
    listener(filterState(currentState, subscription.keys))
    return () => subscriptions.delete(subscription)
  },
  callAction: (action, params = {}): Promise<DeviceCardActionRun> =>
    ipcRenderer.invoke('device-card-runtime:callAction', { action, params }),
  saveConfig: (patch: JsonObject): Promise<JsonObject> =>
    ipcRenderer.invoke('device-card-runtime:saveConfig', patch),
  readManualExclusive: () => manualExclusive('read'),
  acquireManualExclusive: () => manualExclusive('acquire'),
  releaseManualExclusive: () => manualExclusive('release'),
  log: (level, message) => {
    ipcRenderer.send('device-card-runtime:log', { level, message })
  }
}

contextBridge.exposeInMainWorld('unilabCard', bridge)

async function manualExclusive(
  operation: 'read' | 'acquire' | 'release'
): Promise<DeviceCardManualExclusiveSnapshot> {
  const result = await ipcRenderer.invoke(
    'device-card-runtime:manualExclusive',
    operation
  ) as DeviceCardHostManualExclusiveResult
  if (!result.ok || !result.snapshot) {
    throw new Error(result.error || '手动独占（Exclusive）请求失败')
  }
  return result.snapshot
}

function filterState(
  state: Record<string, unknown>,
  keys: Set<string>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([key]) => keys.has(key))
  )
}
