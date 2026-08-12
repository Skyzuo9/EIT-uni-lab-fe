import { describe, expect, it } from 'vitest'

import {
  PASCAL_SCENE_HTML_Z_INDEX_RANGE,
  PASCAL_TRANSFER_HTML_Z_INDEX_RANGE,
} from './htmlLayer'

describe('Pascal HTML overlay layers', () => {
  it('keeps scene labels below application-level drawers', () => {
    expect(PASCAL_SCENE_HTML_Z_INDEX_RANGE).toEqual([90, 0])
    expect(PASCAL_TRANSFER_HTML_Z_INDEX_RANGE).toEqual([80, 0])
    expect(PASCAL_SCENE_HTML_Z_INDEX_RANGE[0]).toBeLessThan(1200)
    expect(PASCAL_TRANSFER_HTML_Z_INDEX_RANGE[0]).toBeLessThan(1200)
  })
})
