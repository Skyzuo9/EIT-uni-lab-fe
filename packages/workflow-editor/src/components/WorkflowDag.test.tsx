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
    edges
  }: PropsWithChildren<{
    deleteKeyCode?: string[] | null
    nodes: Array<{ id: string; deletable?: boolean }>
    edges: Array<{ id: string; deletable?: boolean }>
  }>) => (
    <div
      data-delete-keys={JSON.stringify(deleteKeyCode)}
      data-node-deletable={String(nodes[0]?.deletable)}
      data-edge-id={edges[0]?.id}
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

describe('WorkflowDag material role filter', () => {
  /** 验证物料流角色（MaterialFlowRole）显隐使用带文字的独立复选框。 */
  it('exposes independently selectable role visibility without color-only cues', () => {
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

    expect(markup).toContain('aria-label="物料节点可见性：全部物料"')
    expect(markup).toContain('aria-label="物料节点可见性"')
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('主样品')
    expect(markup).toContain('试剂')
    expect(markup).toContain('全部物料')
  })
})

describe('WorkflowDag canvas controls', () => {
  /** 证明画布按钮按任务分组，并把布局提交保持为唯一主操作。 */
  it('groups view actions separately from material and layout controls', () => {
    const markup = renderToStaticMarkup(
      <WorkflowDag
        nodes={[
          workflowNode,
          materialSourceNode('sample-source', '主样品', 'primary_sample')
        ]}
        links={[]}
        canvasMutationEnabled
        onNodeSelect={vi.fn()}
        onDeleteRequest={vi.fn()}
        onBeautify={vi.fn()}
      />
    )

    expect(markup).toContain('role="toolbar"')
    expect(markup).toContain('aria-label="画布视图与布局工具"')
    expect(markup).toContain('aria-label="视图与选择"')
    expect(markup).toContain('aria-label="物料筛选与布局"')
    expect(markup).toContain('workflow-runtime__canvas-button')
    expect(markup).toContain('workflow-runtime__beautify')
    expect(markup).toContain('aria-busy="false"')
    expect(markup).toContain(
      'data-workflow-layout-direction="horizontal"'
    )
  })

  /** 证明交互态与窄视口规则不依赖运行时内联样式。 */
  it('defines primary, danger, focus and compact responsive states', () => {
    const stylesheet = readFileSync(
      new URL('./_workflow-beautify.scss', import.meta.url),
      'utf8'
    )

    expect(stylesheet).toMatch(
      /workflow-runtime__beautify[\s\S]*background:\s*var\(--unilab-color-workflow\)/
    )
    expect(stylesheet).toMatch(
      /delete-selection\):hover:not\(:disabled\)[\s\S]*unilab-color-danger/
    )
    expect(stylesheet).toMatch(/canvas-button\):focus-visible/)
    expect(stylesheet).toMatch(/@container workflow \(max-width: 900px\)/)
  })

  /** 证明横向蛇形节点纵向堆叠物料卡片，并把 Handle 固定到东西两侧。 */
  it('defines compact vertical node content with east-west handles', () => {
    const stylesheet = readFileSync(
      new URL('./_workflow-primary-sample.scss', import.meta.url),
      'utf8'
    )

    expect(stylesheet).toMatch(/flex-direction:\s*column/)
    expect(stylesheet).toMatch(/react-flow__handle-left/)
    expect(stylesheet).toMatch(/react-flow__handle-right/)
    expect(stylesheet).toMatch(
      /wf-node__handle--target\.react-flow__handle-left/
    )
    expect(stylesheet).toMatch(
      /wf-node__handle--source\.react-flow__handle-right/
    )
    expect(stylesheet).toMatch(/wf-node__material-port-label/)
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
