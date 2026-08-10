import { readFileSync } from 'node:fs'

import type { PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { WorkflowNode } from '../utils/parseWorkflow'
import WorkflowDag from './WorkflowDag'

vi.mock('reactflow', () => ({
  default: ({
    children,
    deleteKeyCode,
    nodes,
    edges,
    fitViewOptions
  }: PropsWithChildren<{
    deleteKeyCode?: string[] | null
    nodes: Array<{
      id: string
      className?: string
      deletable?: boolean
      selected?: boolean
    }>
    edges: Array<{ id: string; deletable?: boolean }>
    fitViewOptions?: { maxZoom?: number }
  }>) => (
    <div
      data-delete-keys={JSON.stringify(deleteKeyCode)}
      data-node-deletable={String(nodes[0]?.deletable)}
      data-node-selection={nodes.map((node) => String(node.selected)).join(',')}
      data-node-classes={nodes.map((node) => node.className).join('|')}
      data-edge-id={edges[0]?.id}
      data-fit-max-zoom={fitViewOptions?.maxZoom}
    >
      {children}
    </div>
  ),
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
      selected: true,
      data: { id: node.id, name: node.name, kind: node.type }
    })),
    edges: [{
      id: 'edge-1',
      source: nodes[0]?.id,
      target: nodes[0]?.id,
      selected: false
    }],
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

describe('WorkflowDag deletion interaction', () => {
  /** 验证画布模式呈现统一删除按钮，并把双删除键交给受控删除入口。 */
  it('exposes deletion for the selected editable node without visual mutation', () => {
    const markup = renderToStaticMarkup(
      <WorkflowDag
        nodes={[workflowNode]}
        links={[]}
        canvasMutationEnabled
        onNodeSelect={vi.fn()}
        onDeleteRequest={vi.fn()}
      />
    )

    expect(markup).toContain('data-delete-keys="[&quot;Delete&quot;,&quot;Backspace&quot;]"')
    expect(markup).toContain('data-node-deletable="false"')
    expect(markup).toContain('删除选中项')
    expect(markup).not.toMatch(/data-disabled-reason="[^"]+"[^>]*>[^<]*删除选中项/)
  })

  /** 验证复合工作流内部节点的删除按钮保持禁用并展示完整原因。 */
  it('keeps a private node deletion disabled with an explicit reason', () => {
    const markup = renderToStaticMarkup(
      <WorkflowDag
        nodes={[{
          ...workflowNode,
          authoringReadOnly: true,
          authoringReadOnlyReason:
            '复合工作流内部私有节点只读；请删除或编辑调用边界'
        }]}
        links={[]}
        canvasMutationEnabled
        onNodeSelect={vi.fn()}
        onDeleteRequest={vi.fn()}
      />
    )

    expect(markup).toContain(
      'data-disabled-reason="复合工作流内部私有节点只读；请删除或编辑调用边界"'
    )
  })
})

describe('WorkflowDag IDE source selection', () => {
  /** 验证代码光标反查到的节点成为 React Flow 唯一可见选中项。 */
  it('projects the externally selected workflow node into the canvas', () => {
    const markup = renderToStaticMarkup(
      <WorkflowDag
        nodes={[
          workflowNode,
          { ...workflowNode, id: 'node-2', name: '第二个动作' }
        ]}
        links={[]}
        selectedNodeId="node-2"
        onNodeSelect={vi.fn()}
      />
    )

    expect(markup).toContain('data-node-selection="false,true"')
    expect(markup).toMatch(
      /data-node-classes="[^"]*\|[^"]*wf-flow-node--source-selected/
    )
  })
})

describe('WorkflowDag material role filter', () => {
  it('exposes labeled role choices without relying on color alone', () => {
    const markup = renderToStaticMarkup(
      <WorkflowDag
        nodes={[
          materialSourceNode('sample-source', '主样品', 'primary_sample'),
          materialSourceNode('reagent-source', '试剂', 'reagent')
        ]}
        links={[]}
        onNodeSelect={vi.fn()}
      />
    )

    expect(markup).toContain('aria-label="按物料角色筛选：全部"')
    expect(markup).toContain('role="radiogroup"')
    expect(markup).toContain('主样品')
    expect(markup).toContain('试剂')
    expect(markup).toContain('全部物料')
  })
})

describe('WorkflowDag host sizing', () => {
  /** 小型纵向流程应允许适度放大，避免在高画布中只占顶部一小块。 */
  it('lets fitView use the available authoring canvas', () => {
    const markup = renderToStaticMarkup(
      <WorkflowDag
        nodes={[workflowNode]}
        links={[]}
        onNodeSelect={vi.fn()}
      />
    )

    expect(markup).toContain('data-fit-max-zoom="1.35"')
  })

  /** Theia 窄分栏仍是高桌面面板，不能套用移动端 260px 固定画布。 */
  it('keeps the responsive graph stage stretched to its grid row', () => {
    const stylesheet = readFileSync(
      new URL('./workflow-persistent/_section-06.scss', import.meta.url),
      'utf8'
    )

    expect(stylesheet).toMatch(
      /persistent-authoring__graph-stage[\s\S]*height:\s*100%/
    )
    expect(stylesheet).not.toMatch(
      /persistent-authoring__graph-stage[\s\S]{0,160}\n\s+height:\s*260px/
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

function materialSourceNode(
  id: string,
  name: string,
  flowRole: string
): WorkflowNode {
  return {
    id,
    name,
    type: 'material_source',
    className: 'MaterialSource',
    labNodeType: 'MaterialSource',
    handles: [{
      uuid: `${id}-resource`,
      handleKey: 'resource',
      displayName: '物料',
      ioType: 'source',
      valueType: 'ResourceSlot',
      valueSchema: { $slot: 'ResourceSlot' }
    }],
    materialSource: {
      mode: 'existing',
      flowRole,
      mountUuid: 'mount-1',
      resourceTemplateUuid: 'resource-template-1'
    }
  }
}
