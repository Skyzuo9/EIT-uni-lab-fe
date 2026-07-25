export type BackendAuthKind = 'none' | 'token' | 'oauth'

export interface BackendConfig {
  id: string
  name: string
  protocol: 'unilab/v1'
  apiUrl: string
  realtimeUrl?: string
  assetUrl?: string
  auth: BackendAuthKind
}

export const DEFAULT_BACKENDS: readonly BackendConfig[] = [
  {
    id: 'local-go',
    name: 'Local Go',
    protocol: 'unilab/v1',
    apiUrl: 'http://127.0.0.1:8000',
    auth: 'none'
  },
  {
    id: 'local-python',
    name: 'Local Python OS',
    protocol: 'unilab/v1',
    apiUrl: 'http://127.0.0.1:8002',
    auth: 'none'
  },
  {
    id: 'cloud',
    name: 'Uni-Lab Cloud',
    protocol: 'unilab/v1',
    apiUrl: '',
    auth: 'oauth'
  }
]

export function getDefaultBackend(backendId = 'local-python'): BackendConfig {
  const backend = DEFAULT_BACKENDS.find((candidate) => candidate.id === backendId)
  if (!backend) throw new Error(`Unknown default backend: ${backendId}`)
  return { ...backend }
}
