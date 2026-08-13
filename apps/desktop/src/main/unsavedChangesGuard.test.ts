import { describe, expect, it } from 'vitest'

import {
  resolveUnsavedUnloadAction,
  validateRendererUnsavedChanges
} from './unsavedChangesGuard'

describe('renderer unsaved changes guard', () => {
  it('keeps the conservative prompt before the renderer reports a state', () => {
    expect(resolveUnsavedUnloadAction(null)).toBe('prompt')
  })

  it('allows an unrelated iframe beforeunload when the workbench is clean', () => {
    expect(resolveUnsavedUnloadAction(false)).toBe('allow')
  })

  it('prompts when the workbench reports unsaved workflow changes', () => {
    expect(resolveUnsavedUnloadAction(true)).toBe('prompt')
  })

  it('accepts only a boolean renderer payload', () => {
    expect(validateRendererUnsavedChanges(true)).toBe(true)
    expect(validateRendererUnsavedChanges(false)).toBe(false)
    expect(() => validateRendererUnsavedChanges('false')).toThrow(
      '未保存状态必须是布尔值'
    )
  })
})
