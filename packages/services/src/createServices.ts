import type { BackendConfig } from './backends'
import {
  getCapabilityStatus,
  resolveServerCapabilities,
  type CapabilityStatus,
  type ServerCapabilities,
  type ServerCapability
} from './capabilities'
import { createHttpClient, type CreateHttpClientOptions } from './http'
import {
  createLaboratoryService,
  type LaboratoryService
} from './laboratory'
import {
  createDeviceActionTaskRuntime,
  type DeviceActionTaskRuntimePort
} from './deviceActionTasks'
import {
  createDeviceSquareService,
  type DeviceSquareService
} from './deviceSquare'
import {
  createRealtimeService,
  type RealtimeService
} from './realtime'
import {
  createMaterialService,
  type MaterialService
} from './materials'
import {
  createWorkflowRuntime,
  type WorkflowRuntimePort
} from './workflow'

export interface Services {
  backend: BackendConfig
  capabilities: ServerCapabilities
  getCapabilityStatus: (capability: ServerCapability) => CapabilityStatus
  laboratory: LaboratoryService
  deviceActionTasks: DeviceActionTaskRuntimePort
  deviceSquare: DeviceSquareService
  materials: MaterialService
  realtime: RealtimeService
  workflow: WorkflowRuntimePort
  dispose: () => void
}

export interface CreateServicesOptions {
  backend: BackendConfig
  fetcher?: CreateHttpClientOptions['fetcher']
  getAccessToken?: CreateHttpClientOptions['getAccessToken']
}

/** 依据单个 Backend 配置装配共享 service ports，并统一管理实时连接生命周期。 */
export function createServices(options: CreateServicesOptions): Services {
  const http = createHttpClient(options)
  const realtime = createRealtimeService(options.backend)
  const capabilities = resolveServerCapabilities(options.backend)
  const workflow = createWorkflowRuntime(http, options.backend)

  return {
    backend: options.backend,
    capabilities,
    getCapabilityStatus: (capability) =>
      getCapabilityStatus(options.backend, capabilities, capability),
    laboratory: createLaboratoryService(http, options.backend),
    deviceActionTasks: createDeviceActionTaskRuntime(http),
    deviceSquare: createDeviceSquareService(http),
    materials: createMaterialService(
      http,
      options.backend,
      capabilities
    ),
    realtime,
    workflow,
    dispose: () => {
      realtime.dispose()
      workflow.dispose()
    }
  }
}
