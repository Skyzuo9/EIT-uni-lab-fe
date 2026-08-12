import { describe, expect, it } from 'vitest'

import {
  hasExplicitBackendSelection,
  resolveDefaultBackend,
  resolveInitialBackend,
  serializeBackendPreference
} from './backendSelection'

describe('backendSelection', () => {
  it('浏览器默认通过同源代理连接本地 Backend', () => {
    const backend = resolveInitialBackend({
      search: '',
      origin: 'http://127.0.0.1:5173',
      managedRuntime: false
    })

    expect(backend.id).toBe('local-go')
    expect(backend.apiUrl).toBe(
      'http://127.0.0.1:5173/__unilab_backend'
    )
  })

  it('Electron 托管运行时默认保持本地 Edge', () => {
    const backend = resolveInitialBackend({
      search: '',
      origin: 'http://127.0.0.1:5173',
      managedRuntime: true
    })

    expect(backend.id).toBe('local-python')
    expect(backend.apiUrl).toBe('http://127.0.0.1:18003')
  })

  it('显式 Backend 参数覆盖持久偏好', () => {
    const backend = resolveInitialBackend({
      search: '?backend=local-go&backendUrl=http://localhost:9000',
      origin: 'http://127.0.0.1:5173',
      managedRuntime: false,
      storedPreference: serializeBackendPreference(
        resolveDefaultBackend('local-python')
      )
    })

    expect(backend.id).toBe('local-go')
    expect(backend.apiUrl).toBe('http://localhost:9000')
    expect(hasExplicitBackendSelection(
      '?backend=local-go&backendUrl=http://localhost:9000'
    )).toBe(true)
  })

  it('拒绝持久偏好中的非回环地址并回退平台默认值', () => {
    const backend = resolveInitialBackend({
      search: '',
      origin: 'http://localhost:5173',
      managedRuntime: false,
      storedPreference: JSON.stringify({
        id: 'local-go',
        apiUrl: 'https://example.com'
      })
    })

    expect(backend.apiUrl).toBe('http://localhost:5173/__unilab_backend')
  })
})
