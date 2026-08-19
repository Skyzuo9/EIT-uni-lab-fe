import { readFileSync } from 'node:fs'

import type { ComponentProps, PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { NodeProps } from 'reactflow'
import { describe, expect, it, vi } from 'vitest'

import type { WorkflowNodeData } from './WorkflowNodeCard'
import WorkflowCompositeContainer from './WorkflowCompositeContainer'

vi.mock('reactflow', () => ({
  Handle: ({ children, ...props }: PropsWithChildren<ComponentProps<'span'>>) => (
    <span {...props}>{children}</span>
  ),
  Position: {
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
    Top: 'top'
  }
}))

describe('WorkflowCompositeContainer material boundary handles', () => {
  it('renders the material handle as the boundary card with an inward bridge', () => {
    const data: WorkflowNodeData = {
      id: 'execute',
      name: '上样-执行 v3（物料直传）',
      color: '#2563eb',
      kind: 'workflow',
      handles: [
        {
          uuid: 'plate-input',
          handleKey: 'plate',
          dataKey: 'plate',
          displayName: 'plate',
          title: '硅胶板',
          ioType: 'target',
          valueType: 'ResourceSlot'
        },
        {
          uuid: 'plate-output',
          handleKey: 'plate',
          dataKey: 'plate',
          displayName: 'plate',
          title: '硅胶板',
          ioType: 'source',
          valueType: 'ResourceSlot'
        }
      ],
      materialHandleAccents: {
        'plate-input': '#1d5ed7',
        'plate-output': '#1d5ed7'
      },
      materialHandleRoles: {
        'plate-input': 'aliquot_sample',
        'plate-output': 'aliquot_sample'
      },
      materialChips: [{
        handleUuid: 'plate-input',
        sourceNodeUuid: 'plate-source',
        sourceNodeName: '硅胶板',
        sourceHandleName: 'plate',
        accent: '#1d5ed7'
      }]
    }
    const markup = renderToStaticMarkup(WorkflowCompositeContainer({
      data,
      targetPosition: 'left',
      sourcePosition: 'right'
    } as NodeProps<WorkflowNodeData>))

    expect(markup).toContain('data-workflow-material-role="aliquot_sample"')
    expect(markup).toContain('--wf-material-accent:#1d5ed7')
    expect(markup.match(/data-workflow-composite-material-port="plate"/g))
      .toHaveLength(2)
    expect(markup.match(/data-material-shape-source="default"/g)).toHaveLength(2)
    expect(markup).not.toContain('wf-node__composite-material-card')
    expect(markup.match(/data-workflow-boundary-bridge=/g)).toHaveLength(2)
    expect(markup).toMatch(
      /type="source" position="right"[^>]+data-workflow-boundary-bridge="target"/
    )
    expect(markup).toMatch(
      /type="target" position="left"[^>]+data-workflow-boundary-bridge="source"/
    )
    expect(markup).toContain('left:17px')
    expect(markup).toContain('right:17px')
    expect(markup).toContain('硅胶板 · 分装样品 物料输入端口')

    const stylesheet = readFileSync(
      new URL('./_workflow-composite-container.scss', import.meta.url),
      'utf8'
    )
    expect(stylesheet).toMatch(
      /wf-node__handle--material\.wf-node__composite-handle[\s\S]*width:\s*34px[\s\S]*height:\s*28px/
    )
    expect(stylesheet).toMatch(
      /wf-node--composite-container[\s\S]*min-width:\s*0[\s\S]*max-width:\s*none/
    )
  })
})
