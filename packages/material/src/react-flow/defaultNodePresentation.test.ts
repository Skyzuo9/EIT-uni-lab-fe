import { describe, expect, it } from 'vitest'

import { materialAggregate } from '../testFixtures'
import { readDefaultMaterialNodePresentation } from './defaultNodePresentation'

describe('default material node presentation', () => {
  it('uses explicit control-node metadata before identifiers', () => {
    const aggregate = materialAggregate('main-computer', {
      config: {
        presentation: { category: 'control-node' },
        resourceConfig: { type: 'device' }
      }
    })

    expect(readDefaultMaterialNodePresentation(aggregate)).toEqual({
      kind: 'control',
      noun: '控制节点'
    })
  })

  it('recognises equipment from graph metadata', () => {
    const aggregate = materialAggregate('liquid-handler', {
      config: {
        source: { nodeType: 'device' }
      }
    })

    expect(readDefaultMaterialNodePresentation(aggregate)).toEqual({
      kind: 'equipment',
      noun: '仪器设备'
    })
  })

  it('falls back safely for an unknown non-physical material', () => {
    const aggregate = materialAggregate('custom-resource')

    expect(readDefaultMaterialNodePresentation(aggregate)).toEqual({
      kind: 'material',
      noun: '物料节点'
    })
  })
})
