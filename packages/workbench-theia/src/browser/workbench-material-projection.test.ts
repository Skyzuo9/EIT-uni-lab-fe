import { describe, expect, it } from 'vitest'

import { resolveReadOnlyMaterialProjection } from './workbench-material-projection'

describe('resolveReadOnlyMaterialProjection', () => {
  it('accepts an explicit read-only Backend projection', () => {
    expect(resolveReadOnlyMaterialProjection(
      '?materialProjection=read-only&workbenchConnection=backend'
      + '&localOsUrl=http%3A%2F%2F127.0.0.1%3A18144'
      + '&materialWorkspace=%2Fworkspace%2FpTLC_platformUI'
    )).toEqual({
      mode: 'read-only',
      backendUrl: 'http://127.0.0.1:18144',
      workspacePath: '/workspace/pTLC_platformUI'
    })
  })

  it('can recover the Theia workspace from the URL hash', () => {
    expect(resolveReadOnlyMaterialProjection(
      '?materialProjection=read-only&workbenchConnection=backend'
      + '&localOsUrl=https%3A%2F%2Fbackend.example.test%2F',
      '#/workspace/pTLC'
    )?.workspacePath).toBe('/workspace/pTLC')
  })

  it.each([
    '?workbenchConnection=backend&localOsUrl=http://127.0.0.1:18144',
    '?materialProjection=read-only&localOsUrl=http://127.0.0.1:18144',
    '?materialProjection=read-only&workbenchConnection=backend'
      + '&localOsUrl=file:///tmp/backend&materialWorkspace=/workspace',
    '?materialProjection=read-only&workbenchConnection=backend'
      + '&localOsUrl=http://user:secret@127.0.0.1:18144&materialWorkspace=/workspace',
    '?materialProjection=read-only&workbenchConnection=backend'
      + '&localOsUrl=http://127.0.0.1:18144&materialWorkspace=relative/path'
  ])('fails closed for incomplete or unsafe input: %s', search => {
    expect(resolveReadOnlyMaterialProjection(search)).toBeNull()
  })
})
