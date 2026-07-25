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
    <section className="flex h-full w-full flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-[#e5e7eb] bg-[#f9fafb] px-3.5 py-2">
        <span className="h-[9px] w-[9px] rounded-full bg-[#12b886]" />
        <span className="text-[13px] font-semibold text-[#1f2329]">拓扑预览</span>
        <span className="ml-auto text-[11px] text-[#6b7280]">
          {structure.nodes.length} 节点 · {structure.links.length} 连接 · {structure.steps.length} 步骤
        </span>
      </header>

      {structure.error && (
        <div className="border-b border-[#fda29b] bg-[#fef3f2] px-3.5 py-1.5 text-xs text-[#b42318]">
          解析错误:{structure.error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <WorkflowDag
            nodes={structure.nodes}
            links={structure.links}
            onNodeSelect={handleNodeSelect}
          />
        </div>

        <div className="max-h-[40%] overflow-y-auto border-t border-[#e8ebef] bg-[#fbfcfe] px-4 py-3">
          <h4 className="mb-2.5 mt-0 text-xs font-semibold uppercase tracking-[0.02em] text-[#6b7684]">
            调试执行
          </h4>
          <DebugToolbar debug={debug} />
        </div>
      </div>
    </section>
  )
}
