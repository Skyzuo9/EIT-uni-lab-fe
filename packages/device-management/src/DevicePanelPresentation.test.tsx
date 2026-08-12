import { describe, expect, it } from 'vitest'

import {
  createArgumentDraft,
  mergeArgumentDraft,
} from './DevicePanelPresentation'

describe('device action argument drafts', () => {
  it('does not let a stale cleared value hide a newly declared default', () => {
    const fallback = createArgumentDraft({
      duration: { type: 'number', required: false, default: 30 }
    })
    expect(mergeArgumentDraft(fallback, { duration: '' })).toEqual({
      duration: '30'
    })
  })
})
