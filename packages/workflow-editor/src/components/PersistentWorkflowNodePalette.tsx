import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'
import { WorkflowButton } from './WorkflowButton'

/** 展示物料来源（MaterialSource）、操作和子工作流节点库。 */
export function PersistentWorkflowNodePalette({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  return (
    <aside
      id="persistent-authoring-node-palette"
      className="persistent-authoring__palette"
      aria-label="工作流节点面板"
    >
      <header>
        <strong>节点</strong>
        <span>添加到画布编辑区</span>
      </header>
      <MaterialSourcePaletteSection model={model} />
      <ActionPaletteSection model={model} />
      <PublishedWorkflowPaletteSection model={model} />
    </aside>
  )
}

/** 展示物料来源（MaterialSource）节点入口和目录状态。 */
function MaterialSourcePaletteSection({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  const disabled = model.busy || !model.policy.canvasMutationEnabled ||
    !model.effectiveMaterialSourceCatalog ||
    model.materialSourceAuthorityBlocked
  return (
    <section aria-label="物料来源（MaterialSource）模板">
      <h3>物料</h3>
      <WorkflowButton
        type="button"
        className="persistent-authoring__palette-source"
        disabled={disabled}
        disabledReason={materialSourceDisabledReason(model)}
        onClick={model.addMaterialSourceNode}
      >
        <span aria-hidden="true">▱</span>
        <span>
          <strong>物料来源</strong>
          <small>OS 准入声明</small>
        </span>
      </WorkflowButton>
      {model.materialSourceCatalogLoading && (
        <p role="status">正在读取物料与库位目录…</p>
      )}
      {model.materialSourceCatalogError && (
        <div className="persistent-authoring__palette-problem">
          <p>{model.materialSourceCatalogError}</p>
          <button
            type="button"
            onClick={() => void model.refreshMaterialSourceCatalog()}
          >
            重新读取
          </button>
        </div>
      )}
    </section>
  )
}

/** 解释物料来源（MaterialSource）节点为何不可添加。 */
function materialSourceDisabledReason(
  model: PersistentWorkflowAuthoringModel
): string {
  if (model.busy) return '正在处理工作流，请稍后添加物料来源'
  if (!model.policy.canvasMutationEnabled) return '当前模式只允许查看工作流画布'
  if (model.materialSourceAuthorityBlocked) {
    return '物料来源目录或引用已失效，请先刷新'
  }
  return '物料与库位目录尚未加载完成'
}

/** 展示操作（Action）模板节点入口。 */
function ActionPaletteSection({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  return (
    <section aria-label="动作（Action）模板">
      <h3>操作</h3>
      <div className="persistent-authoring__palette-actions">
        {model.actionCatalog?.actionTemplates.map((template) => (
          <WorkflowButton
            type="button"
            key={template.uuid}
            disabled={
              model.busy ||
              !model.policy.canvasMutationEnabled ||
              !model.graph
            }
            disabledReason={nodeInsertionDisabledReason(model, '操作')}
            onClick={() => model.addTypedActionNode(template.uuid)}
          >
            <span aria-hidden="true">⌁</span>
            <span>
              <strong>{template.displayName}</strong>
              <small>{template.name}</small>
            </span>
          </WorkflowButton>
        ))}
      </div>
    </section>
  )
}

/** 展示已发布子工作流（Workflow）模板节点入口。 */
function PublishedWorkflowPaletteSection({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element | null {
  if (!model.actionCatalog?.workflowTemplates.length) return null
  return (
    <section aria-label="子工作流（Workflow）模板">
      <h3>子工作流</h3>
      <div className="persistent-authoring__palette-actions">
        {model.actionCatalog.workflowTemplates.map((template) => (
          <WorkflowButton
            type="button"
            key={template.uuid}
            disabled={
              model.busy ||
              !model.policy.canvasMutationEnabled ||
              !model.graph
            }
            disabledReason={nodeInsertionDisabledReason(model, '子工作流')}
            onClick={() => model.addPublishedWorkflowNode(template.uuid)}
          >
            <span aria-hidden="true">▣</span>
            <span>
              <strong>{template.displayName}</strong>
              <small>{template.source.symbol}</small>
            </span>
          </WorkflowButton>
        ))}
      </div>
    </section>
  )
}

/** 解释工作流（Workflow）节点为何不可插入。 */
function nodeInsertionDisabledReason(
  model: PersistentWorkflowAuthoringModel,
  nodeLabel: string
): string {
  if (model.busy) return `正在处理工作流，请稍后添加${nodeLabel}节点`
  if (!model.policy.canvasMutationEnabled) return '当前模式只允许查看工作流画布'
  return '工作流图尚未加载完成'
}
