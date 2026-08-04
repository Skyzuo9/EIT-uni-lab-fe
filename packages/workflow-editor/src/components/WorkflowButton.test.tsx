import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WorkflowButton } from './WorkflowButton'

describe('WorkflowButton', () => {
  /** 验证禁用按钮通过悬浮标题与无障碍说明解释不可点击原因。 */
  it('exposes the disabled reason without replacing the visible label', () => {
    const markup = renderToStaticMarkup(
      <WorkflowButton disabled disabledReason="正在保存工作流，请稍候">
        保存
      </WorkflowButton>
    )

    expect(markup).toContain('disabled=""')
    expect(markup).toContain('title="正在保存工作流，请稍候"')
    expect(markup).toContain('aria-description="正在保存工作流，请稍候"')
    expect(markup).toContain('data-disabled-reason="正在保存工作流，请稍候"')
    expect(markup).toContain('>保存</button>')
  })

  /** 验证按钮可用时保留原本的补充说明，不展示禁用原因。 */
  it('preserves the enabled title', () => {
    const markup = renderToStaticMarkup(
      <WorkflowButton
        disabledReason="当前不可运行"
        title="运行完整工作流"
      >
        运行
      </WorkflowButton>
    )

    expect(markup).toContain('title="运行完整工作流"')
    expect(markup).not.toContain('data-disabled-reason')
  })
})
