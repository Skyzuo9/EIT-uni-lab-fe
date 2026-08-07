import WorkflowDag from './WorkflowDag'
import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'
import { PersistentWorkflowNodeInspector } from './PersistentWorkflowNodeInspector'
import { PersistentWorkflowNodePalette } from './PersistentWorkflowNodePalette'
import { WorkflowButton } from './WorkflowButton'

/** 展示工作流（Workflow）画布、节点库与属性检查器。 */
export function PersistentWorkflowCanvasPane({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  return (
    <section
      className="persistent-authoring__pane persistent-authoring__canvas"
      aria-label="工作流画布"
    >
      <CanvasStageHeader model={model} />
      <CanvasBody model={model} />
    </section>
  )
}

/** 展示工作流（Workflow）画布上下文与全局输入输出入口。 */
function CanvasStageHeader({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  return (
    <header className="persistent-authoring__stage-header">
      <div>
        <strong>完整控制流 DAG</strong>
        <span>
          {model.structure.nodes.length} 个节点 ·
          {' '}{model.structure.links.length} 条边
        </span>
      </div>
      <div className="persistent-authoring__stage-context">
        <p>{canvasContextText(model)}</p>
        <div className="persistent-authoring__stage-tools">
          {model.mode === 'canvas' && (
            <button
              type="button"
              className="persistent-authoring__panel-toggle"
              aria-controls="persistent-authoring-node-palette"
              aria-pressed={model.nodePaletteOpen}
              onClick={() => model.setNodePaletteOpen((open) => !open)}
            >
              {model.nodePaletteOpen ? '隐藏节点库' : '显示节点库'}
            </button>
          )}
          <WorkflowButton
            type="button"
            className="persistent-authoring__io-trigger"
            disabled={!model.graph}
            disabledReason="工作流图尚未加载完成"
            title={model.mode === 'code'
              ? '当前为只读预览；切换到画布模式后可配置'
              : '配置整个工作流的输入、输出与节点参数连接'}
            onClick={() => model.setWorkflowIoOpen(true)}
          >
            <span>输入与输出</span>
            <strong>
              输入 {model.candidateIo?.input_contract.parameters.length ?? 0}
              {' · '}输出 {model.candidateIo?.output_contract.outputs.length ?? 0}
            </strong>
          </WorkflowButton>
        </div>
      </div>
    </header>
  )
}

/** 解释工作流（Workflow）画布当前投影的来源与编辑权。 */
function canvasContextText(model: PersistentWorkflowAuthoringModel): string {
  if (model.projectionKind === 'candidate') {
    return model.mode === 'code'
      ? '当前画布是服务器候选版本的只读预览'
      : '画布编辑区基于候选版本；保存时由 OS 生成完整 Python'
  }
  return model.mode === 'code'
    ? '当前显示已应用版本；暂无待应用修改'
    : '画布编辑区基于已应用版本；暂无待应用修改'
}

/** 编排工作流（Workflow）的节点库、图形和属性检查器。 */
function CanvasBody({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  const className = [
    'persistent-authoring__canvas-body',
    model.mode === 'code' ? 'is-code-mode' : '',
    model.mode === 'canvas' && !model.nodePaletteOpen
      ? 'is-palette-closed'
      : '',
    model.mode === 'canvas' && model.selectedNodeUuid
      ? 'has-inspector'
      : ''
  ].filter(Boolean).join(' ')

  return (
    <div className={className}>
      {model.graph ? <LoadedCanvas model={model} /> : <CanvasLoading />}
    </div>
  )
}

/** 展示已加载的工作流（Workflow）画布组成部分。 */
function LoadedCanvas({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  return (
    <>
      {model.mode === 'canvas' && model.nodePaletteOpen && (
        <PersistentWorkflowNodePalette model={model} />
      )}
      <div className="persistent-authoring__graph-stage">
        <WorkflowDag
          nodes={model.structure.nodes}
          links={model.structure.links}
          onNodeSelect={model.selectCanvasNode}
          onSetStart={model.toggleDebugStartNode}
          onToggleBreakpoint={model.toggleDebugBreakpoint}
          nodeStates={model.taskNodeStates}
          breakpoints={model.debugBreakpoints}
          startNodeId={model.debugExecutionScope.startNodeId}
          beforeStartNodeIds={model.debugExecutionScope.beforeStartNodeIds}
          canBeautify={
            !model.busy &&
            model.policy.canvasMutationEnabled &&
            model.structure.nodes.length > 0
          }
          beautifyDisabledReason={model.busy
            ? '正在处理工作流，请稍后美化布局'
            : !model.policy.canvasMutationEnabled
              ? '当前模式只允许查看工作流画布'
              : '工作流图尚未加载完成'}
          onBeautify={model.beautifyCanvasLayout}
          canvasMutationEnabled={model.policy.canvasMutationEnabled}
          onConnectHandles={model.connectTypedHandles}
          onDeleteRequest={model.deleteCanvasElements}
        />
      </div>
      {model.mode === 'canvas' && model.selectedNodeUuid && (
        <PersistentWorkflowNodeInspector model={model} />
      )}
    </>
  )
}

/** 展示工作流（Workflow）画布加载状态。 */
function CanvasLoading(): React.JSX.Element {
  return (
    <p className="persistent-authoring__empty">
      正在读取 OS 工作流编辑数据…
    </p>
  )
}
