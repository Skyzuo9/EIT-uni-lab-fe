import {
  CANONICAL_PANEL_MANIFEST,
  PanelGroup,
  PanelLayoutRenderer,
  createPanelRegistry,
  parsePanelLayoutDocument,
  usePanelVisibility,
  type PanelAppAdapter
} from '@unilab/workbench-layout'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { panelPresetDocument } from './panelLayouts'

const adapter: PanelAppAdapter<Record<string, never>> = {
  registry: createPanelRegistry(CANONICAL_PANEL_MANIFEST),
  renderers: {
    resolve: () => ({ status: 'empty' })
  },
  scope: {
    resolve: () => ({})
  },
  storage: {
    load: () => null,
    save: () => undefined
  },
  parseLayout: parsePanelLayoutDocument
}

/** 将面板可见性上下文投影为可断言的静态标记。 */
function VisibilityProbe(): React.JSX.Element {
  return <span data-panel-visible={usePanelVisibility()} />
}

describe('lab panel visibility layout', () => {
  /** 证明折叠工作流区域时保留挂载并同步隐藏相邻分隔条。 */
  it('keeps a hidden workflow region mounted and removes its separator', () => {
    const markup = renderToStaticMarkup(
      <PanelLayoutRenderer
        adapter={adapter}
        document={panelPresetDocument('lab')}
        groupActions={{
          'default-layout-group': <button>显示工作流</button>
        }}
        hiddenNodeIds={['default-workflow-group']}
      />
    )

    expect(markup).toContain('显示工作流')
    expect(markup).toMatch(
      /data-panel-layout-node-id="default-workflow-group"[^>]*hidden=""[^>]*display:none/
    )
    expect(markup).toMatch(/hidden=""[^>]*role="separator"/)
    expect(markup).toContain('data-panel-type="workflow-dag-picker"')
  })

  /** 证明折叠的活动标签向子组件发布不可见状态。 */
  it('publishes false visibility to an active tab in a collapsed group', () => {
    const markup = renderToStaticMarkup(
      <PanelGroup
        activeTabId="workflow"
        groupId="workflow-group"
        tabs={[{
          id: 'workflow',
          title: '工作流',
          content: <VisibilityProbe />
        }]}
        visible={false}
      />
    )

    expect(markup).toContain('data-panel-visible="false"')
  })

  /** 证明布局操作位于业务工具栏错误边界之外，业务失败时仍可恢复布局。 */
  it('isolates group actions from the business toolbar boundary', () => {
    const markup = renderToStaticMarkup(
      <PanelGroup
        activeTabId="material"
        groupAction={<button>隐藏工作流</button>}
        groupId="material-group"
        tabs={[{
          id: 'material',
          title: '物料',
          content: <span>物料内容</span>
        }]}
        toolbar={<span>业务工具栏</span>}
      />
    )

    expect(markup).toMatch(
      /data-panel-toolbar-content="true"[\s\S]*data-panel-group-action="true"/
    )
    expect(markup).toContain('业务工具栏')
    expect(markup).toContain('隐藏工作流')
  })
})
