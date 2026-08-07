import { PersistentWorkflowCanvasPane } from './PersistentWorkflowCanvasPane'
import { PersistentWorkflowCodePane } from './PersistentWorkflowCodePane'
import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'
import { PersistentWorkflowOverlays } from './PersistentWorkflowOverlays'
import { PersistentWorkflowRuntimeDock } from './PersistentWorkflowRuntimeDock'
import { PersistentWorkflowStatusBanners } from './PersistentWorkflowStatusBanners'
import { PersistentWorkflowToolbar } from './PersistentWorkflowToolbar'
import styles from './workflow.module.scss'

/** 编排持久化工作流（Workflow）的工具栏、双视图与运行区。 */
export function PersistentWorkflowAuthoringView({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  return (
    <div
      className={[
        styles.workflow,
        'workflow-runtime persistent-authoring',
        'relative flex h-full w-full flex-col',
        'bg-[var(--unilab-color-canvas)] text-[var(--unilab-color-text)]'
      ].join(' ')}
    >
      <PersistentWorkflowToolbar model={model} />
      <PersistentWorkflowStatusBanners model={model} />
      <main className={[
        'persistent-authoring__workbench',
        model.mode === 'canvas' ? 'is-canvas-mode' : ''
      ].filter(Boolean).join(' ')}>
        <PersistentWorkflowCodePane model={model} />
        <PersistentWorkflowCanvasPane model={model} />
      </main>
      <PersistentWorkflowRuntimeDock model={model} />
      <PersistentWorkflowOverlays model={model} />
    </div>
  )
}
