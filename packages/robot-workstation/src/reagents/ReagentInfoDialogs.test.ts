import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  mergeLookupFields,
  ReagentInfoEditorDialog,
  validateReagentInfoEditor
} from './ReagentInfoDialogs'

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

  /** 证明 PubChem 只补空字段，不覆盖用户内容，并始终同步不可见 InChIKey。 */
  it('merges PubChem candidates without overwriting manual fields', () => {
    expect(mergeLookupFields({
      nameEn: 'Manual name',
      molecularFormula: '',
      smiles: '',
      inchiKey: '',
      molecularWeight: ''
    }, null, {
      name: 'Ethanol',
      molecularFormula: 'C2H6O',
      smiles: 'CCO',
      inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
      molecularWeight: 46.07
    })).toEqual({
      nameEn: 'Manual name',
      molecularFormula: 'C2H6O',
      smiles: 'CCO',
      inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
      molecularWeight: '46.07'
    })
  })

  /** 证明 InChIKey 不再作为用户字段展示，但仍通过隐藏字段提交后端候选值。 */
  it('hides the InChIKey editor field', () => {
    const markup = renderToStaticMarkup(createElement(ReagentInfoEditorDialog, {
      mode: 'create',
      onLookup: vi.fn(),
      onSave: vi.fn(),
      onClose: vi.fn()
    }))

    expect(markup).not.toContain('InChIKey（可选）')
    expect(markup).toContain('type="hidden" name="inchiKey"')
  })

  /** 证明名称不启用浏览器历史，物态由工作台自定义列表提供但仍参与 FormData。 */
  it('disables name autocomplete and renders an accessible physical state listbox', () => {
    const markup = renderToStaticMarkup(createElement(ReagentInfoEditorDialog, {
      mode: 'create',
      onLookup: vi.fn(),
      onSave: vi.fn(),
      onClose: vi.fn()
    }))

    expect(markup).toContain('<form autoComplete="off"')
    expect(markup).toMatch(/autoComplete="off"[^>]*name="name"/)
    expect(markup).toContain('role="combobox"')
    expect(markup).toContain('type="hidden" name="physicalState" value="unknown"')
    expect(markup).not.toContain('<select')
  })
})
