import { describe, expect, it } from 'vitest'

import { workflowGraphJsonProjectionVisible } from './persistentAuthoringProjection'

describe('persistent Authoring projection visibility', () => {
  it('materializes full graph JSON only for the visible embedded JSON pane', () => {
    expect(workflowGraphJsonProjectionVisible({
      mode: 'code',
      codeProjection: 'json',
      hideEmbeddedCodeEditor: false
    })).toBe(true)
    expect(workflowGraphJsonProjectionVisible({
      mode: 'canvas',
      codeProjection: 'json',
      hideEmbeddedCodeEditor: false
    })).toBe(false)
    expect(workflowGraphJsonProjectionVisible({
      mode: 'code',
      codeProjection: 'python',
      hideEmbeddedCodeEditor: false
    })).toBe(false)
    expect(workflowGraphJsonProjectionVisible({
      mode: 'code',
      codeProjection: 'json',
      hideEmbeddedCodeEditor: true
    })).toBe(false)
  })
})
