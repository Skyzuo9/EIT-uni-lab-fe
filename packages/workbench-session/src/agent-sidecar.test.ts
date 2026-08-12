import { createServer } from 'node:http'

import { describe, expect, it } from 'vitest'

import {
  ensureManagedLocalAgentDefaults,
  isProtectedAgentRequest,
  managedConversationRequestBody,
  managedLocalAgentAuthStatus,
  managedLocalBootstrapScript
} from './agent-sidecar'

describe('Workbench Agent private-state boundary', () => {
  it('rejects direct, encoded and traversal access to .unilabos', () => {
    expect(isProtectedAgentRequest('/api/files?path=../.unilabos/agent/aionui')).toBe(true)
    expect(isProtectedAgentRequest('/api/files?path=..%2F.unilabos%2Fsession.json')).toBe(true)
    expect(isProtectedAgentRequest('/api/files?path=%252Eunilabos%252Fsession.json')).toBe(true)
    expect(isProtectedAgentRequest('/api/files?path=.unilabos/session.json')).toBe(true)
    expect(isProtectedAgentRequest('/api/files', JSON.stringify({ path: '.unilabos/logs' }))).toBe(true)
    expect(isProtectedAgentRequest('/api/files', '{"path":"\\u002eunilabos/logs"}')).toBe(true)
  })

  it('allows ordinary Editable Package files and provider/session APIs', () => {
    expect(isProtectedAgentRequest('/api/files?path=workflows/s06_robot.py')).toBe(false)
    expect(isProtectedAgentRequest('/api/conversations', '{"provider":"codex"}')).toBe(false)
  })
})

describe('Workbench Agent managed-local identity bridge', () => {
  it('publishes the aioncore system identity without a login credential', () => {
    expect(managedLocalAgentAuthStatus()).toEqual({
      mode: 'password',
      authenticated: true,
      user: {
        id: 'system_default_user',
        name: 'UniLab Local',
        username: 'system_default_user',
        avatarUrl: null
      }
    })
  })

  it('seeds Simplified Chinese once and primes the renderer language', async () => {
    const requests: Array<{ method: string; url: string; body: string }> = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        requests.push({
          method: request.method ?? '',
          url: request.url ?? '',
          body: Buffer.concat(chunks).toString('utf8')
        })
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify(request.url?.startsWith('/api/settings/client')
          ? { success: true, data: {} }
          : { success: true, data: { language: 'en-US' } }))
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('test server did not expose a TCP port')
    }

    try {
      expect(await ensureManagedLocalAgentDefaults(address.port)).toBe('zh-CN')
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (
        error ? reject(error) : resolve()
      )))
    }

    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'PATCH',
        url: '/api/settings',
        body: JSON.stringify({ language: 'zh-CN' })
      }),
      expect.objectContaining({
        method: 'PUT',
        url: '/api/settings/client',
        body: JSON.stringify({
          'guid.lastAssistantId': 'bare:8e1acf31',
          'unilab.defaultLanguageVersion': '1'
        })
      })
    ]))

    const bootstrap = managedLocalBootstrapScript('zh-CN')
    expect(bootstrap).toContain('window.__initialLanguage = "zh-CN"')
    expect(bootstrap).toContain(
      "localStorage.setItem('i18nextLng', \"zh-CN\")"
    )
  })
})

describe('Workbench Agent managed Workspace binding', () => {
  it('replaces AionUI temporary mode without changing the selected assistant', () => {
    const body = Buffer.from(JSON.stringify({
      name: 'Inspect the project',
      assistant: {
        id: 'bare:2d23ff1c',
        conversation_overrides: { permission: 'auto' }
      },
      extra: {
        workspace: '',
        custom_workspace: false,
        default_files: []
      }
    }))

    expect(JSON.parse(managedConversationRequestBody(
      body,
      '/workspace/Uni-Lab-SZLab'
    ).toString('utf8'))).toEqual({
      name: 'Inspect the project',
      assistant: {
        id: 'bare:2d23ff1c',
        conversation_overrides: { permission: 'auto' }
      },
      extra: {
        workspace: '/workspace/Uni-Lab-SZLab',
        custom_workspace: true,
        default_files: []
      }
    })
  })
})
