/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 工作流结构预览(DAG 拓扑图 + 调试执行工具栏)
 * Context: JSON 实时解析预览;点击节点弹抽屉编参;底部为调试运行工具栏
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useMemo } from 'react'
import WorkflowDag from './WorkflowDag'
import DebugToolbar from './DebugToolbar'
import { parseWorkflowJson } from '../utils/parseWorkflowJson'
import { useWorkflowDebug } from '../hooks/useWorkflowDebug'

interface WorkflowPreviewProps {
  source: string
  onEditStep: (stepIndex: number) => void
}

// 结构预览:JSON 解析为 DAG 拓扑图 + 执行步骤(节点与步骤一一对应)
export default function WorkflowPreview({
  source,
  onEditStep
}: WorkflowPreviewProps): React.JSX.Element {
  const structure = useMemo(() => parseWorkflowJson(source), [source])
  const debug = useWorkflowDebug()

  // 点击 DAG 节点:JSON 中节点与步骤一一对应,按节点 id 定位到对应步骤
  const handleNodeSelect = (nodeId: string): void => {
    const stepIndex = structure.nodes.findIndex((node) => node.id === nodeId)
    if (stepIndex >= 0) onEditStep(stepIndex)
  }

  return (
    <section className="panel">
      <header className="panel__header">
        <span className="panel__dot panel__dot--material" />
        <span className="panel__title">拓扑预览</span>
        <span className="panel__meta">
          {structure.nodes.length} 节点 · {structure.links.length} 连接 · {structure.steps.length} 步骤
        </span>
      </header>

      {structure.error && <div className="material__error">解析错误:{structure.error}</div>}

      <div className="wf-preview">
        <div className="wf-preview__dag">
          <WorkflowDag
            nodes={structure.nodes}
            links={structure.links}
            onNodeSelect={handleNodeSelect}
          />
        </div>

        <div className="wf-preview__block">
          <h4 className="wf-preview__title">调试执行</h4>
          <DebugToolbar debug={debug} />
        </div>
      </div>
    </section>
  )
}
