import type { WorkflowSupportingMaterialPresentation } from '../utils/workflowReactionMaterialProjection'

interface WorkflowSupportingMaterialPresentationControlProps {
  value: WorkflowSupportingMaterialPresentation
  onChange: (value: WorkflowSupportingMaterialPresentation) => void
}

/**
 * 切换辅助物料（Material）的反应式标注与完整支线投影。
 *
 * @param props 当前展示方式与受控变更入口。
 * @returns 支持键盘操作且不依赖颜色识别状态的双选控制。
 */
export default function WorkflowSupportingMaterialPresentationControl({
  value,
  onChange
}: WorkflowSupportingMaterialPresentationControlProps): React.JSX.Element {
  return (
    <div
      className="workflow-runtime__supporting-material-presentation"
      role="group"
      aria-label="辅助物料展示方式"
    >
      <button
        type="button"
        className={value === 'reaction-formula' ? 'is-active' : undefined}
        aria-pressed={value === 'reaction-formula'}
        title="辅助物料像有机反应式的反应物一样显示在加入步骤旁"
        onClick={() => onChange('reaction-formula')}
      >
        反应式
      </button>
      <button
        type="button"
        className={value === 'full-branches' ? 'is-active' : undefined}
        aria-pressed={value === 'full-branches'}
        title="显示辅助物料的完整来源、预处理节点和连线"
        onClick={() => onChange('full-branches')}
      >
        完整支线
      </button>
    </div>
  )
}
