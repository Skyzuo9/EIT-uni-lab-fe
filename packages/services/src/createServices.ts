import type { BackendConfig } from './backends'
import { createHttpClient, type CreateHttpClientOptions } from './http'
import {
  createLaboratoryService,
  type LaboratoryService
} from './laboratory'
import {
  createRealtimeService,
  type RealtimeService
} from './realtime'
import {
  createMaterialService,
  type MaterialService
} from './materials'

export interface Services {
  backend: BackendConfig
  laboratory: LaboratoryService
  materials: MaterialService
  realtime: RealtimeService
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

  return {
    backend: options.backend,
    laboratory: createLaboratoryService(http),
    materials: createMaterialService(http),
    realtime,
    dispose: () => realtime.dispose()
  }
}
