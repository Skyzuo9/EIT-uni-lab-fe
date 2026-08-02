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
