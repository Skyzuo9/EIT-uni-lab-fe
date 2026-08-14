import { describe, expect, it } from 'vitest'

import { validateReagentInfoEditor } from './ReagentInfoDialogs'

describe('ReagentInfoDialogs validation', () => {
  /** 证明无 CAS 的自配物质可以登记，但名称、物态和正数参考属性仍严格校验。 */
  it('accepts optional CAS and rejects invalid required chemistry fields', () => {
    expect(validateReagentInfoEditor({
      name: 'E2E 校准液',
      aliases: ['质控液'],
      physicalState: 'liquid'
    })).toBeNull()

    expect(validateReagentInfoEditor({
      name: '',
      aliases: [],
      physicalState: 'liquid'
    })).toBe('试剂名称不能为空')
    expect(validateReagentInfoEditor({
      name: '错误 CAS',
      aliases: [],
      cas: '64-17-4',
      physicalState: 'liquid'
    })).toBe('CAS 号校验位不正确，请修正或留空')
    expect(validateReagentInfoEditor({
      name: '错误密度',
      aliases: [],
      densityGPerMl: 0,
      physicalState: 'liquid'
    })).toBe('参考密度必须是大于零的有限数')
  })
})
