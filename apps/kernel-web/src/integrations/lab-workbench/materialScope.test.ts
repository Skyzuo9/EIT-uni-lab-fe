import { describe, expect, it } from 'vitest'

import { resolveMaterialScope } from './materialScope'

describe('Material scope resolution', () => {
  it('never asks a singleton server for a laboratory ID', () => {
    expect(
      resolveMaterialScope({ workspaceMode: 'singleton' }, null)
    ).toEqual({ kind: 'singleton' })
  })

  it('does not manufacture a laboratory ID for Cloud', () => {
    expect(
      resolveMaterialScope({ workspaceMode: 'laboratory' }, null)
    ).toBeNull()
    expect(
      resolveMaterialScope(
        { workspaceMode: 'laboratory' },
        ' lab-42 '
      )
    ).toEqual({
      kind: 'laboratory',
      laboratoryId: 'lab-42'
    })
  })
})
