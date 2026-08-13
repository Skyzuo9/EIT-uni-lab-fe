import { describe, expect, it } from 'vitest'

import { hasWorkbenchUnsavedChanges } from './workbench-unsaved-changes'

describe('workbench unsaved changes projection', () => {
  it('is clean when neither the workflow panel nor any editor is dirty', () => {
    expect(hasWorkbenchUnsavedChanges(false, [false, false])).toBe(false)
  })

  it('keeps a dirty workflow panel even when the current editor is clean', () => {
    expect(hasWorkbenchUnsavedChanges(true, [false])).toBe(true)
  })

  it('keeps a dirty background editor instead of checking only the current tab', () => {
    expect(hasWorkbenchUnsavedChanges(false, [false, true])).toBe(true)
  })
})
