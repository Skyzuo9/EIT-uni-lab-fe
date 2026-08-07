import { CodeEditor } from '@unilab/code-editor'

import type { PersistentWorkflowAuthoringModel } from './persistentWorkflowAuthoringModel'
import { WorkflowButton } from './WorkflowButton'

/** 展示工作流（Workflow）的 Python 草稿与 JSON 投影。 */
export function PersistentWorkflowCodePane({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  const jsonVisible = model.mode === 'code' && model.codeProjection === 'json'

  return (
    <section
      className="persistent-authoring__pane persistent-authoring__code"
      aria-label="工作流代码视图"
    >
      {model.mode === 'code' && <ProjectionSwitch model={model} />}
      <div className="persistent-authoring__code-projections">
        <div hidden={jsonVisible} aria-hidden={jsonVisible}>
          <CodeEditor
            title={`${model.workflowUuid}.py`}
            editor={model.editor}
            language="Python"
          />
        </div>
        <div hidden={!jsonVisible} aria-hidden={!jsonVisible}>
          <CodeEditor
            title={`${model.workflowUuid}.json`}
            editor={model.jsonProjectionEditor}
            language="JSON · 只读"
          />
        </div>
      </div>
      <p className="persistent-authoring__authority-note">
        {codeAuthorityNote(model)}
      </p>
    </section>
  )
}

/** 切换工作流（Workflow）代码视图的投影格式。 */
function ProjectionSwitch({
  model
}: {
  model: PersistentWorkflowAuthoringModel
}): React.JSX.Element {
  return (
    <div className="persistent-authoring__projection-toolbar">
      <div
        className="persistent-authoring__projection-switch"
        role="group"
        aria-label="代码视图格式"
      >
        <WorkflowButton
          type="button"
          className={model.codeProjection === 'python' ? 'is-active' : ''}
          aria-pressed={model.codeProjection === 'python'}
          disabledReason="Python 草稿视图始终可用"
          onClick={() => model.setCodeProjection('python')}
        >
          Python
        </WorkflowButton>
        <WorkflowButton
          type="button"
          className={model.codeProjection === 'json' ? 'is-active' : ''}
          aria-pressed={model.codeProjection === 'json'}
          disabled={!model.graph}
          disabledReason="OS 尚未返回可展示的候选工作流图"
          onClick={() => model.setCodeProjection('json')}
        >
          JSON
        </WorkflowButton>
      </div>
      <span title={model.codeProjection === 'python'
        ? 'Python 草稿可编辑'
        : 'JSON 是 OS 候选图的只读投影'}>
        {model.codeProjection === 'python'
          ? 'Python 草稿 · 可编辑'
          : 'OS 候选图 · 只读'}
      </span>
    </div>
  )
}

/** 解释当前工作流（Workflow）代码投影的编辑权。 */
function codeAuthorityNote(model: PersistentWorkflowAuthoringModel): string {
  if (model.mode === 'canvas') return 'Python 是 OS 生成的只读投影'
  if (model.codeProjection === 'json') {
    return 'JSON 来自 OS 候选图，仅供查看；切换不会覆盖 Python 草稿'
  }
  return 'Python 草稿可编辑；保存时校验草稿哈希与工作流版本'
}
