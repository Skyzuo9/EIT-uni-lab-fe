import { describe, expect, it } from 'vitest'

import { validateReagentEditor } from './BackendReagentDialogs'

describe('Backend reagent editor validation', () => {
  /** 证明创建必须使用校验位正确的 CAS，避免向外部化合物查询发送明显无效身份。 */
  it('validates the CAS checksum for Backend creation', () => {
    const base = {
      materialId: 'material-1',
      cas: '64-17-5',
      physicalState: 'liquid' as const,
      quantity: 100,
      quantityUnit: 'mL'
    }

    expect(validateReagentEditor(base, 'create')).toBeNull()
    expect(validateReagentEditor({ ...base, cas: '64-17-6' }, 'create')).toBe(
      '请输入校验位正确的 CAS 号'
    )
  })

  /** 证明浓度值和单位必须成对提交，且库存数量不能为负。 */
  it('rejects partial concentration and negative quantity', () => {
    const base = {
      materialId: 'material-1',
      cas: '64-17-5',
      physicalState: 'liquid' as const,
      quantity: 100,
      quantityUnit: 'mL'
    }

    expect(validateReagentEditor({
      ...base,
      concentrationValue: 95
    }, 'create')).toBe('浓度数值和单位必须同时填写或同时留空')
    expect(validateReagentEditor({ ...base, quantity: -1 }, 'edit')).toBe(
      '数量必须是大于等于零的有限数'
    )
  })
})
