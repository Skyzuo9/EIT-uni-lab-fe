/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: 输入/输出参数字段列表编辑器(可增删多项,含变量名/类型/必填)
 * Context: 节点编辑抽屉内使用;参考 Dify/大 web 字段列表:变量图标 + 名称 + 类型徽标 + 必填标记
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import {
  PARAM_TYPE_OPTIONS,
  emptyParamField,
  getParamTypeBadge
} from '../utils/workflowParams'
import type { ParamField, ParamValueType } from '../utils/workflowParams'

interface ParamListEditorProps {
  title: string
  fields: ParamField[]
  onChange: (fields: ParamField[]) => void
  // 是否显示"必填"开关(输出参数通常无需必填)
  showRequired?: boolean
}

// 参数字段列表编辑器:纯展示 + 通过 onChange 上抛整份字段数组
export default function ParamListEditor({
  title,
  fields,
  onChange,
  showRequired = true
}: ParamListEditorProps): React.JSX.Element {
  // 更新指定行的部分字段
  const handleFieldChange = (index: number, patch: Partial<ParamField>): void => {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)))
  }

  // 新增一行空字段
  const handleAdd = (): void => {
    onChange([...fields, emptyParamField()])
  }

  // 删除指定行
  const handleRemove = (index: number): void => {
    onChange(fields.filter((_, i) => i !== index))
  }

  return (
    <div className="rounded-lg border border-[#e5e7eb] bg-white p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#334155]">{title}</span>
        <button
          type="button"
          className="inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md border-0 bg-[#eef2ff] text-base leading-none text-[#4f46e5] transition-colors hover:bg-[#e0e7ff]"
          onClick={handleAdd}
          aria-label={`新增${title}`}
        >
          +
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="m-0 px-0.5 py-1.5 text-xs text-[#94a3b8]">暂无{title}，点击右上角 + 添加</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {fields.map((field, index) => (
            <li key={index} className="flex items-center gap-2 rounded-md border border-[#eef0f2] bg-[#f8fafc] px-2 py-1.5">
              <span className="shrink-0 text-[11px] font-semibold text-[#6366f1]">{'{x}'}</span>

              <input
                type="text"
                className="h-7 min-w-0 flex-1 rounded border border-[#dbe0e6] bg-white px-2 text-xs text-[#1e293b] outline-none focus:border-[#6366f1]"
                value={field.name}
                placeholder="变量名"
                onChange={(event) => handleFieldChange(index, { name: event.target.value })}
              />

              <select
                className="h-7 shrink-0 cursor-pointer rounded border border-[#dbe0e6] bg-white px-1.5 text-xs text-[#475569]"
                value={field.type}
                onChange={(event) =>
                  handleFieldChange(index, { type: event.target.value as ParamValueType })
                }
              >
                {PARAM_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <span className="min-w-7 shrink-0 rounded bg-[#eef2f6] px-1.5 py-0.5 text-center text-[11px] text-[#64748b]">
                {getParamTypeBadge(field.type)}
              </span>

              {showRequired && (
                <button
                  type="button"
                  className={`shrink-0 cursor-pointer rounded border px-2 py-[3px] text-[11px] transition-colors ${
                    field.required
                      ? 'border-[#fecaca] bg-[#fef2f2] text-[#dc2626]'
                      : 'border-[#e2e8f0] bg-[#f1f5f9] text-[#94a3b8]'
                  }`}
                  onClick={() => handleFieldChange(index, { required: !field.required })}
                >
                  必填
                </button>
              )}

              <button
                type="button"
                className="inline-flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-base leading-none text-[#94a3b8] transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626]"
                onClick={() => handleRemove(index)}
                aria-label="删除该参数"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
