import { MaterialSourceInspector } from './MaterialSourceInspector'
import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'

/** 展示工作流（Workflow）画布节点的名称、物料与操作属性。 */
export function PersistentWorkflowNodeInspector({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  return (
    <aside
      className="persistent-authoring__node-editor"
      aria-label="画布节点编辑器"
    >
      <InspectorHeader model={model} />
      <NodeNameField model={model} />
      <MaterialSourceFields model={model} />
      <ActionFields model={model} />
      <p id="persistent-node-name-help">
        名称修改属于画布缓冲，接受完整 Python 差异后才会持久化。
      </p>
    </aside>
  )
}

/** 展示工作流（Workflow）节点检查器标题与关闭入口。 */
function InspectorHeader({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  /** 关闭检查器并将焦点还给原画布节点。 */
  const closeInspector = (): void => {
    const nodeUuid = model.selectedNodeUuid
    model.setSelectedNodeUuid(null)
    model.setSelectedNodeName('')
    model.setSelectedNodeNameDirty(false)
    model.setActionParametersOpen(false)
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${nodeUuid}"]`
      )?.focus({ preventScroll: true })
    })
  }

  return (
    <header className="persistent-authoring__inspector-heading">
      <span>
        <span>属性</span>
        <strong>
          {model.selectedIsMaterialSource ? '物料来源' : '节点属性'}
        </strong>
      </span>
      <button
        type="button"
        aria-label="关闭属性面板"
        title="关闭属性面板"
        onClick={closeInspector}
      >
        ×
      </button>
    </header>
  )
}

/** 编辑工作流（Workflow）画布节点名称。 */
function NodeNameField({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  /** 记录画布缓冲区中的节点名称变更。 */
  const changeNodeName = (event: React.ChangeEvent<HTMLInputElement>): void => {
    model.setSelectedNodeName(event.target.value)
    model.setSelectedNodeNameDirty(true)
    model.setMessage('画布缓冲已修改；保存前将生成完整 Python 差异')
  }

  return (
    <label>
      节点名称
      <input
        value={model.selectedNodeName}
        disabled={model.busy || !model.policy.canvasMutationEnabled ||
          model.selectedNodeIsInternal}
        aria-describedby="persistent-node-name-help"
        onChange={changeNodeName}
      />
    </label>
  )
}

/** 展示物料来源（MaterialSource）节点属性。 */
function MaterialSourceFields({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  const editor = model.selectedMaterialSourceEditor
  return (
    <>
      {editor && (
        <MaterialSourceInspector
          editor={editor}
          accent={model.materialTraces.materialSourceAccents.get(
            editor.nodeUuid
          )}
          editable={
            !model.busy && model.policy.canvasMutationEnabled &&
            !model.materialSourceCatalogLoading &&
            !model.materialSourceAuthorityBlocked
          }
          status={model.taskNodeStates[model.selectedNodeUuid ?? ''] || 'pending'}
          diagnostics={model.diagnostics.filter((diagnostic) =>
            diagnostic.node_id === model.selectedNodeUuid
          )}
          onChange={(patch) => model.updateMaterialSource(editor, patch)}
        />
      )}
      {model.selectedMaterialSourceProjection.error && (
        <p role="alert">
          物料来源选择读取失败：
          {model.selectedMaterialSourceProjection.error}
        </p>
      )}
    </>
  )
}

/** 展示操作（Action）节点参数摘要。 */
function ActionFields({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  const editor = model.selectedActionEditor
  const outputCount = model.selectedActionTemplate?.handles.filter(
    (handle) => handle.ioType === 'source'
  ).length ?? 0
  return (
    <>
      {editor && (
        <section
          className="persistent-authoring__action-summary"
          aria-label="操作参数摘要"
        >
          <div>
            <strong>操作参数</strong>
            <span>输入 {editor.fields.length} · 输出 {outputCount}</span>
          </div>
          <p>点击下方按钮编辑输入，并查看输出端口与连接关系。</p>
          <button
            type="button"
            className="workflow-runtime__primary"
            onClick={() => model.setActionParametersOpen(true)}
          >
            配置节点参数
          </button>
        </section>
      )}
      {model.selectedActionProjection.error && (
        <p role="alert">
          操作模板或端口读取失败：{model.selectedActionProjection.error}
        </p>
      )}
    </>
  )
}
