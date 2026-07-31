import {
  CodeEditor,
  type UseCodeMirrorResult
} from '@unilab/code-editor'
import type {
  PointerEventHandler,
  ReactNode,
  RefObject
} from 'react'

import type {
  WorkflowLink,
  WorkflowNode
} from '../utils/parseWorkflow'
import WorkflowDag from './WorkflowDag'

interface WorkflowStageProps {
  compactPane: 'code' | 'dag'
  containerRef: RefObject<HTMLDivElement | null>
  editor: UseCodeMirrorResult
  editorTitle: string
  editorLanguage: 'JSON' | 'Python'
  isDragging: boolean
  leftRatio: number
  onDividerPointerDown: PointerEventHandler<HTMLDivElement>
  nodes: WorkflowNode[]
  links: WorkflowLink[]
  parseError: string | null
  nodeStates: Readonly<Record<string, string>>
  breakpoints: ReadonlySet<string>
  startNodeId: string | null
  beforeStartNodeIds: ReadonlySet<string>
  pausedBeforeNodeId: string | null
  pythonHasUnappliedChanges: boolean
  legendOpen: boolean
  onLegendToggle: () => void
  onNodeSelect: (nodeId: string) => void
  onSetStart: (nodeId: string) => void
  onToggleBreakpoint: (nodeId: string) => void
  children: ReactNode
}

export function WorkflowStage({
  compactPane,
  containerRef,
  editor,
  editorTitle,
  editorLanguage,
  isDragging,
  leftRatio,
  onDividerPointerDown,
  nodes,
  links,
  parseError,
  nodeStates,
  breakpoints,
  startNodeId,
  beforeStartNodeIds,
  pausedBeforeNodeId,
  pythonHasUnappliedChanges,
  legendOpen,
  onLegendToggle,
  onNodeSelect,
  onSetStart,
  onToggleBreakpoint,
  children
}: WorkflowStageProps): React.JSX.Element {
  return (
    <div
      ref={containerRef}
      className={[
        'workbench',
        'workflow-runtime__workbench',
        `workflow-runtime__workbench--${compactPane}`,
        isDragging ? 'workbench--dragging' : ''
      ].filter(Boolean).join(' ')}
    >
      <div
        className="workbench__pane"
        style={{ flexBasis: `${leftRatio * 100}%` }}
      >
        <CodeEditor
          title={editorTitle}
          editor={editor}
          language={editorLanguage}
        />
      </div>
      <div
        className="workbench__divider"
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onDividerPointerDown}
      >
        <span className="workbench__grip" />
      </div>
      <div
        className="workbench__pane workflow-runtime__stage"
        style={{ flexBasis: `${(1 - leftRatio) * 100}%` }}
      >
        <header className="workflow-runtime__stage-header">
          <div>
            <strong>完整控制流 DAG</strong>
            <span>
              {nodes.length} 个节点 · {links.length} 条控制边
            </span>
            {pythonHasUnappliedChanges && (
              <span
                className="workflow-runtime__projection-state"
                role="status"
              >
                Python 修改尚未应用
              </span>
            )}
          </div>
          <div className="workflow-runtime__stage-tools">
            <button
              type="button"
              aria-expanded={legendOpen}
              onClick={onLegendToggle}
            >
              状态图例
            </button>
            <details className="workflow-runtime__help">
              <summary>操作帮助</summary>
              <div>
                单击节点可同步定位代码。起始点与断点可通过节点内按钮设置；
                右键和双击仅作为快捷操作。
              </div>
            </details>
          </div>
        </header>
        {legendOpen && (
          <div
            className="workflow-runtime__legend"
            aria-label="节点状态图例"
          >
            <span className="is-start">⚑ 起始点</span>
            <span className="is-breakpoint">● 断点</span>
            <span className="is-paused">Ⅱ 暂停位置</span>
            <span className="is-running">● 正在运行</span>
            <span className="is-success">✓ 执行成功</span>
            <span className="is-excluded">— 不执行或已跳过</span>
          </div>
        )}
        {parseError ? (
          <div className="workflow-runtime__empty">{parseError}</div>
        ) : (
          <div className="workflow-runtime__canvas">
            <WorkflowDag
              nodes={nodes}
              links={links}
              nodeStates={nodeStates}
              breakpoints={breakpoints}
              startNodeId={startNodeId}
              beforeStartNodeIds={beforeStartNodeIds}
              pausedBeforeNodeId={pausedBeforeNodeId}
              onNodeSelect={onNodeSelect}
              onSetStart={onSetStart}
              onToggleBreakpoint={onToggleBreakpoint}
            />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
