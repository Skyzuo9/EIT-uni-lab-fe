import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  reagentInfoParameterEntries,
  filterReagentInfos,
  filterReagentInventory,
  ReagentLibraryView
} from './ReagentViews'

describe('ReagentViews filters', () => {
  /** 证明试剂台账可以按真实供应商与当前任务元数据检索。 */
  it('filters ledger rows by authoritative supplier and task metadata', () => {
    const items = [{
      id: 'reagent-1', name: '乙醇', status: 'available' as const,
      metadata: { supplier: '国药集团', current_task: 'EXP-024' }
    }, {
      id: 'reagent-2', name: '甲醇', status: 'available' as const,
      metadata: { supplier: '默克' }
    }]

    expect(filterReagentInventory(items, 'EXP-024').map(item => item.id))
      .toEqual(['reagent-1'])
    expect(filterReagentInventory(items, '默克').map(item => item.id))
      .toEqual(['reagent-2'])
  })

  /** 证明试剂库可以按英文名、中文别名与分子式检索基础信息。 */
  it('filters reagent information by aliases and chemistry identity', () => {
    const infos = [{
      id: 'info-1', name: '乙醇', nameEn: 'Ethanol', aliases: ['酒精'],
      cas: '64-17-5', molecularFormula: 'C2H6O', physicalState: 'liquid'
    }, {
      id: 'info-2', name: '甲醇', nameEn: 'Methyl alcohol', aliases: ['木醇'],
      cas: '67-56-1', molecularFormula: 'CH4O', physicalState: 'liquid'
    }]

    expect(filterReagentInfos(infos, 'Ethanol').map(info => info.id))
      .toEqual(['info-1'])
    expect(filterReagentInfos(infos, '木醇').map(info => info.id))
      .toEqual(['info-2'])
    expect(filterReagentInfos(infos, 'C2H6O').map(info => info.id))
      .toEqual(['info-1'])
  })

  /** 证明内部写入来源不会冒充自定义参数，用户参数仍按可读名称展示。 */
  it('hides internal reagent metadata and keeps user-defined parameters', () => {
    const base = {
      id: 'info-1', name: '乙醇', aliases: [], physicalState: 'liquid' as const
    }

    expect(reagentInfoParameterEntries({
      ...base,
      metadata: { source: 'frontend:robot-workstation' }
    })).toEqual([])
    expect(reagentInfoParameterEntries({
      ...base,
      metadata: {
        source: 'frontend:robot-workstation',
        storage: '阴凉通风',
        custom_parameters: [{ name: '纯度', value: 'AR' }]
      }
    })).toEqual(['纯度: AR', '储存要求: 阴凉通风'])
  })

  /** 证明全部身份都只有内部元数据时，列表不保留空的自定义参数列。 */
  it('omits the custom parameter column until user parameters exist', () => {
    const base = {
      id: 'info-1', name: '乙醇', aliases: [], physicalState: 'liquid' as const
    }
    const internalOnly = renderToStaticMarkup(createElement(ReagentLibraryView, {
      infos: [{ ...base, metadata: { source: 'frontend:robot-workstation' } }],
      query: ''
    }))
    const withUserParameters = renderToStaticMarkup(createElement(ReagentLibraryView, {
      infos: [{ ...base, metadata: { storage: '阴凉通风' } }],
      query: ''
    }))

    expect(internalOnly).not.toContain('<th>自定义参数</th>')
    expect(withUserParameters).toContain('<th>自定义参数</th>')
  })
})
