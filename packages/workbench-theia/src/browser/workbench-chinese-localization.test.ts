import { describe, expect, it } from 'vitest'

import { WorkbenchChineseTextReplacementContribution } from './workbench-chinese-localization'

describe('WorkbenchChineseTextReplacementContribution', () => {
  const contribution = new WorkbenchChineseTextReplacementContribution()

  it('fills the remaining main-menu gaps for Simplified Chinese', () => {
    expect(contribution.getReplacement('zh-cn')).toMatchObject({
      Selection: '选择',
      View: '视图',
      Go: '转到',
      Terminal: '终端',
      Help: '帮助'
    })
  })

  it('does not override a language explicitly selected by the user', () => {
    expect(contribution.getReplacement('en')).toEqual({})
  })
})
