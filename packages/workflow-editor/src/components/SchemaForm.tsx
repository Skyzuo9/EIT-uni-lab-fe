/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: RJSF 参数表单封装(schema.properties.goal 为根,ajv8 校验)
 * Context: 对齐大 web InteractivePanel 的 JSON Schema 驱动表单,供步骤编参
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { IChangeEvent } from '@rjsf/core'
import type { RJSFSchema } from '@rjsf/utils'

interface SchemaFormProps {
  // 步骤的完整 action_schema(含 properties.goal)
  schema: Record<string, unknown> | null
  formData: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}

// 从完整 schema 中取出参数根(对齐大 web schema.properties.goal)
function extractGoalSchema(schema: Record<string, unknown> | null): RJSFSchema | null {
  if (!schema) return null
  const properties = schema.properties
  if (properties && typeof properties === 'object') {
    const goal = (properties as Record<string, unknown>).goal
    if (goal && typeof goal === 'object') return goal as RJSFSchema
  }
  // 无 goal 包装时,退回整个 schema
  return schema as RJSFSchema
}

// RJSF 参数表单:按 JSON Schema 渲染带类型/校验的表单,隐藏内置提交按钮
export default function SchemaForm({ schema, formData, onChange }: SchemaFormProps): React.JSX.Element {
  const goalSchema = extractGoalSchema(schema)

  if (!goalSchema) {
    return <p className="section__hint">该步骤没有可用的参数 Schema,无法生成表单。</p>
  }

  return (
    <div className="schema-form">
      <Form
        schema={goalSchema}
        validator={validator}
        formData={formData}
        liveValidate
        showErrorList={false}
        onChange={(event: IChangeEvent) => onChange(event.formData ?? {})}
      >
        {/* 覆盖默认提交按钮:由抽屉底部统一控制保存 */}
        <></>
      </Form>
    </div>
  )
}
