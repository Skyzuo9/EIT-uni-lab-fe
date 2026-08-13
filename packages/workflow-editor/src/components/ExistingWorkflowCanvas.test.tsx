import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { WorkflowStructure } from '../utils/parseWorkflow'
import { ExistingWorkflowCanvas } from './ExistingWorkflowCanvas'

const emptyStructure: WorkflowStructure = {
  nodes: [],
  links: [],
  steps: [],
  error: null
}

function renderBackendCanvas(overrides: Partial<React.ComponentProps<
  typeof ExistingWorkflowCanvas
>> = {}): string {
  return renderToStaticMarkup(
    <ExistingWorkflowCanvas
      structure={emptyStructure}
      loading
      error={null}
      selectedNodeId={null}
      nodeStates={{}}
      onNodeSelect={vi.fn()}
      onRetry={vi.fn()}
      {...overrides}
    />
  )
}

describe('ExistingWorkflowCanvas Backend authority states', () => {
  it('describes Backend canvas saves as independent from workspace code', () => {
    const markup = renderBackendCanvas({
      editingAvailable: true,
      editable: true
    })

    expect(markup).toContain('Backend 定义 · 已同步')
    expect(markup).toContain('前端画布修改通过 revision CAS 直接保存到 Backend')
    expect(markup).toContain('画布可编辑并直接保存')
    expect(markup).toContain('本地 Python 代码修改不生效')
  })

  it('labels a live task as a temporary lock instead of missing authoring', () => {
    const markup = renderBackendCanvas({
      editingAvailable: true,
      editable: false,
      readOnlyReason: '活动任务期间不能修改其工作流定义'
    })

    expect(markup).toContain('Backend 定义 · 运行中锁定')
    expect(markup).toContain('活动任务期间不能修改其工作流定义')
    expect(markup).toContain('任务结束后可继续编辑和保存')
    expect(markup).not.toContain('创作写操作尚未启用')
  })

  it('keeps missing Backend write capability distinct from a temporary lock', () => {
    const markup = renderBackendCanvas({
      editingAvailable: false,
      editable: false,
      readOnlyReason: 'Backend 未提供工作流图写接口'
    })

    expect(markup).toContain('Backend 定义 · 只读')
    expect(markup).toContain('Backend 未提供工作流图写接口')
    expect(markup).toContain('当前 Backend 未开放画布保存')
  })
})
