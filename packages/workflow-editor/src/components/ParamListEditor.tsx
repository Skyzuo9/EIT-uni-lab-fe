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
    <div className="param-editor">
      <div className="param-editor__head">
        <span className="param-editor__title">{title}</span>
        <button
          type="button"
          className="param-editor__add"
          onClick={handleAdd}
          aria-label={`新增${title}`}
        >
          +
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="param-editor__empty">暂无{title}，点击右上角 + 添加</p>
      ) : (
        <ul className="param-editor__list">
          {fields.map((field, index) => (
            <li key={index} className="param-editor__row">
              <span className="param-editor__icon">{'{x}'}</span>

              <input
                type="text"
                className="param-editor__name"
                value={field.name}
                placeholder="变量名"
                onChange={(event) => handleFieldChange(index, { name: event.target.value })}
              />

              <select
                className="param-editor__type"
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

              <span className="param-editor__badge">{getParamTypeBadge(field.type)}</span>

              {showRequired && (
                <button
                  type="button"
                  className={`param-editor__required${field.required ? ' is-active' : ''}`}
                  onClick={() => handleFieldChange(index, { required: !field.required })}
                >
                  必填
                </button>
              )}

              <button
                type="button"
                className="param-editor__remove"
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
