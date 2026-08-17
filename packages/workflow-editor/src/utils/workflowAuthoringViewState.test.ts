import { describe, expect, it } from 'vitest'

import { resolveWorkflowEditMode } from './workflowAuthoringViewState'

describe('workflow authoring view state', () => {
  it('defaults the Theia external-editor surface to canvas mode', () => {
    expect(resolveWorkflowEditMode({
      codeViewing: true,
      sourceEditing: true,
      hideEmbeddedCodeEditor: true
    })).toBe('canvas')
  })

  it('restores a persisted mode and lets a shareable URL override it', () => {
    expect(resolveWorkflowEditMode({
      codeViewing: true,
      sourceEditing: true,
      hideEmbeddedCodeEditor: true,
      storedMode: 'code',
      search: '?workflowEditMode=canvas'
    })).toBe('canvas')
  })

  it('rejects code mode when the definition source cannot be viewed', () => {
    expect(resolveWorkflowEditMode({
      codeViewing: false,
      sourceEditing: false,
      hideEmbeddedCodeEditor: true,
      search: '?workflowEditMode=code'
    })).toBe('canvas')
  })
})
