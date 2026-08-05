import { readFileSync } from 'node:fs'

import type { PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { WorkflowNode } from '../utils/parseWorkflow'
import WorkflowDag from './WorkflowDag'

vi.mock('reactflow', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Panel: ({ children }: PropsWithChildren) => <div>{children}</div>
}))

vi.mock('../hooks/useWorkflowDag', () => ({
  useWorkflowDag: (nodes: WorkflowNode[]) => ({
    nodes: nodes.map((node) => ({
      id: node.id,
      position: { x: 0, y: 0 },
      data: { id: node.id, name: node.name, kind: node.type }
    })),
    edges: [],
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn()
  })
}))

describe('WorkflowDag disabled beautify explanation', () => {
  /** 证明禁用原因只通过统一按钮说明暴露，不生成原生 title。 */
  it('uses one complete accessible tooltip instead of the native title', () => {
    const markup = renderToStaticMarkup(
      <WorkflowDag
        nodes={[workflowNode]}
        links={[]}
        canBeautify={false}
        onNodeSelect={vi.fn()}
      />
    )
    expect(markup).not.toContain('title="请先完成当前 Python 编译"')
    expect(markup).toContain(
      'aria-description="请先完成当前 Python 编译"'
    )
    expect(markup).toContain(
      'data-disabled-reason="请先完成当前 Python 编译"'
    )
  })

  /** 证明统一提示限制视口宽度，并允许长文案完整换行。 */
  it('keeps the tooltip inside the viewport and wraps long copy', () => {
    const stylesheet = readFileSync(
      new URL('./_workflow-foundations.scss', import.meta.url),
      'utf8'
    )

    expect(stylesheet).toMatch(
      /workflowDisabledButtonTooltip[\s\S]*position:\s*fixed/
    )
    expect(stylesheet).toMatch(
      /workflowDisabledButtonTooltip[\s\S]*max-width:\s*min\(/
    )
    expect(stylesheet).toMatch(
      /workflowDisabledButtonTooltip[\s\S]*white-space:\s*normal/
    )
    expect(stylesheet).toMatch(
      /workflowDisabledButtonTooltip[\s\S]*overflow-wrap:\s*anywhere/
    )
  })
})

const workflowNode: WorkflowNode = {
  id: 'node-1',
  name: '示例动作',
  type: 'action',
  className: 'ExampleDevice',
  labNodeType: 'Device'
}
