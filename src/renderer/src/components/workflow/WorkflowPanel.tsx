/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-23
 * Prompt Summary: 工作流方向面板(仅 JSON 编辑 + 上传/下载 + DAG 预览 + 抽屉 RJSF 编参)
 * Context: 对齐大 web:点步骤/节点 -> 右侧滑出抽屉 -> RJSF 表单 -> 保存回写 JSON;支持上传/下载工作流文件
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useState } from 'react'
import CodeEditor from '../editor/CodeEditor'
import WorkflowPreview from './WorkflowPreview'
import SchemaForm from './SchemaForm'
import ParamListEditor from './ParamListEditor'
import SlideOverDrawer from '../common/SlideOverDrawer'
import { useCodeMirror } from '../../hooks/useCodeMirror'
import { useResizableSplit } from '../../hooks/useResizableSplit'
import { useWorkflowStepEditor } from '../../hooks/useWorkflowStepEditor'
import type { NodeDraft } from '../../hooks/useWorkflowStepEditor'
import { useWorkflowFileUpload } from '../../hooks/useWorkflowFileUpload'
import { useWorkflowDownload } from '../../hooks/useWorkflowDownload'
import { parseWorkflowJson } from '../../utils/parseWorkflowJson'
import { SAMPLE_WORKFLOW_JSON } from '../../data/sampleWorkflow'

// 下载文件名
const WORKFLOW_FILE_NAME = 'workflow.json'

// 抽屉草稿初始值(取值 + 输入/输出参数字段)
const EMPTY_DRAFT: NodeDraft = { values: {}, inputParams: [], outputParams: [] }

// 工作流方向:左侧 JSON 编辑,右侧 DAG 预览,点步骤弹抽屉 RJSF 编参
export default function WorkflowPanel(): JSX.Element {
  // 当前抽屉编辑的步骤索引;null 表示抽屉关闭
  const [editingStep, setEditingStep] = useState<number | null>(null)
  // 抽屉内的节点草稿(取值 + 输入/输出参数字段)
  const [draft, setDraft] = useState<NodeDraft>(EMPTY_DRAFT)
  // 上传错误提示
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { containerRef, leftRatio, isDragging, handlePointerDown } = useResizableSplit({
    initialRatio: 0.5,
    minRatio: 0.3,
    maxRatio: 0.7
  })

  const editor = useCodeMirror(SAMPLE_WORKFLOW_JSON, 'json')
  const { readNodeDraft, writeNodeDraft } = useWorkflowStepEditor()
  const { download } = useWorkflowDownload()

  const structure = parseWorkflowJson(editor.value)
  const editingStepData = editingStep != null ? structure.steps[editingStep] ?? null : null

  // 打开抽屉时,从当前 JSON 载入该节点草稿(取值 + 输入/输出参数)
  const openStep = useCallback(
    (stepIndex: number) => {
      setDraft(readNodeDraft(editor.value, stepIndex))
      setEditingStep(stepIndex)
    },
    [editor.value, readNodeDraft]
  )

  // 保存草稿:回写 JSON 并替换编辑器内容
  const handleSave = useCallback(() => {
    if (editingStep == null) return
    const next = writeNodeDraft(editor.value, editingStep, draft)
    if (next) editor.replaceContent(next)
    setEditingStep(null)
  }, [editingStep, draft, editor, writeNodeDraft])

  // 上传文件:关闭抽屉并将内容载入编辑器
  const { inputRef, openFilePicker, handleFileChange } = useWorkflowFileUpload({
    onLoaded: ({ content }) => {
      setEditingStep(null)
      setUploadError(null)
      editor.replaceContent(content)
    },
    onError: (message) => setUploadError(message)
  })

  // 下载当前编辑器内容为 JSON 文件
  const handleDownload = useCallback(() => {
    download(editor.value, WORKFLOW_FILE_NAME)
  }, [download, editor.value])

  return (
    <div className="workflow">
      <div className="workflow__toolbar">
        <span className="workflow__toolbar-label">工作流</span>
        <span className="workflow__format">JSON 工作流</span>

        <div className="workflow__toolbar-actions">
          {uploadError && <span className="workflow__upload-error">{uploadError}</span>}
          <button type="button" className="workflow__upload" onClick={openFilePicker}>
            上传文件
          </button>
          <button type="button" className="workflow__upload" onClick={handleDownload}>
            下载
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            className="workflow__file-input"
            onChange={handleFileChange}
          />
        </div>
      </div>

      <div
        ref={containerRef}
        className={`workbench${isDragging ? ' workbench--dragging' : ''}`}
      >
        <div className="workbench__pane" style={{ flexBasis: `${leftRatio * 100}%` }}>
          <CodeEditor title={WORKFLOW_FILE_NAME} editor={editor} language="JSON" />
        </div>
        <div
          className="workbench__divider"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handlePointerDown}
        >
          <span className="workbench__grip" />
        </div>
        <div className="workbench__pane" style={{ flexBasis: `${(1 - leftRatio) * 100}%` }}>
          <WorkflowPreview source={editor.value} onEditStep={openStep} />
        </div>
      </div>

      <SlideOverDrawer
        open={editingStep != null}
        title={
          <span className="drawer__title-row">
            <span className="drawer__badge">#{(editingStep ?? 0) + 1}</span>
            <span>{editingStepData?.action ?? ''}</span>
          </span>
        }
        onClose={() => setEditingStep(null)}
        footer={
          <>
            <button
              type="button"
              className="drawer__btn"
              onClick={() => setEditingStep(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="drawer__btn drawer__btn--primary"
              onClick={handleSave}
            >
              保存到 JSON
            </button>
          </>
        }
      >
        <div className="drawer__sections">
          <ParamListEditor
            title="输入参数"
            fields={draft.inputParams}
            onChange={(inputParams) => setDraft((prev) => ({ ...prev, inputParams }))}
          />
          <ParamListEditor
            title="输出参数"
            fields={draft.outputParams}
            showRequired={false}
            onChange={(outputParams) => setDraft((prev) => ({ ...prev, outputParams }))}
          />
          <div className="drawer__section">
            <span className="drawer__section-title">参数取值</span>
            <SchemaForm
              schema={editingStepData?.schema ?? null}
              formData={draft.values}
              onChange={(values) => setDraft((prev) => ({ ...prev, values }))}
            />
          </div>
        </div>
      </SlideOverDrawer>
    </div>
  )
}
