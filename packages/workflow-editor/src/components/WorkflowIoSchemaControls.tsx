import type { WorkflowValueSchema } from '@unilab/services'

import {
  isArraySchema,
  isNullable,
  jsonValue,
  nonNullSchema,
  nullableSchema,
  schemaForItemMode,
  schemaForMode,
  schemaMode,
  withOptionalText,
  withSchemaField,
  type NonNullableWorkflowIoSchema,
  type WorkflowIoArrayItemSchema,
  type WorkflowIoSchemaMode
} from './workflowIoEditorModel'

interface SchemaControlProps {
  label: string
  schema: WorkflowValueSchema
  disabled: boolean
  onProblem: (message: string | null) => void
  onChange: (schema: WorkflowValueSchema) => void
}

/**
 * 编辑工作流输入或输出的值模式及约束。
 *
 * @param props 字段标签、当前模式、只读态和变更回调。
 * @returns 类型选择器及与当前类型匹配的约束控件。
 */
export function WorkflowIoSchemaControl({
  label,
  schema,
  disabled,
  onProblem,
  onChange
}: SchemaControlProps): React.JSX.Element {
  const nullable = isNullable(schema)
  const base = nonNullSchema(schema)

  /** 应用一次非空模式变换并保留当前可空标志。 */
  const apply = (operation: () => NonNullableWorkflowIoSchema): void => {
    try {
      const next = operation()
      onChange(nullable ? nullableSchema(next) : next)
      onProblem(null)
    } catch (value) {
      onProblem(value instanceof Error ? value.message : String(value))
    }
  }

  return (
    <>
      <SchemaTypeSelect
        label={label}
        mode={schemaMode(base)}
        allowArray
        disabled={disabled}
        onChange={(mode) => apply(() => schemaForMode(mode))}
      />
      {isArraySchema(base) ? (
        <>
          <SchemaTypeSelect
            label={`${label} 项目`}
            mode={schemaMode(base.items)}
            allowArray={false}
            disabled={disabled}
            onChange={(mode) => apply(() => ({
              ...base,
              items: schemaForItemMode(mode)
            }))}
          />
          <SchemaConstraintFields
            label={`${label} 项目`}
            schema={base.items as WorkflowIoArrayItemSchema}
            disabled={disabled}
            onChange={(items) => apply(() => ({ ...base, items }))}
            onProblem={onProblem}
          />
          <OptionalNumberField
            label="最少项目数"
            ariaLabel={`${label} 最少项目数`}
            value={base.minItems}
            integer
            nonNegative
            disabled={disabled}
            onChange={(value) => apply(() => withSchemaField(
              base,
              'minItems',
              value
            ))}
          />
          <OptionalNumberField
            label="最多项目数"
            ariaLabel={`${label} 最多项目数`}
            value={base.maxItems}
            integer
            nonNegative
            disabled={disabled}
            onChange={(value) => apply(() => withSchemaField(
              base,
              'maxItems',
              value
            ))}
          />
        </>
      ) : (
        <SchemaConstraintFields
          label={label}
          schema={base as WorkflowIoArrayItemSchema}
          disabled={disabled}
          onChange={(next) => apply(() => next)}
          onProblem={onProblem}
        />
      )}
    </>
  )
}

/** 渲染工作流值模式类型选择器。 */
function SchemaTypeSelect({
  label,
  mode,
  allowArray,
  disabled,
  onChange
}: {
  label: string
  mode: WorkflowIoSchemaMode
  allowArray: boolean
  disabled: boolean
  onChange: (mode: WorkflowIoSchemaMode) => void
}): React.JSX.Element {
  return (
    <label>
      数据类型
      <select
        aria-label={`${label} 数据类型`}
        value={mode}
        disabled={disabled}
        onChange={(event) => onChange(
          event.target.value as WorkflowIoSchemaMode
        )}
      >
        <option value="string">文本</option>
        <option value="integer">整数</option>
        <option value="number">数值</option>
        <option value="boolean">布尔值</option>
        <option value="object">对象（JSON）</option>
        {allowArray && <option value="array">列表</option>}
        <option value="resource_slot">资源位</option>
      </select>
    </label>
  )
}

/** 渲染与单值模式匹配的枚举、数值、文本或物料占位符约束。 */
function SchemaConstraintFields({
  label,
  schema,
  disabled,
  onChange,
  onProblem
}: {
  label: string
  schema: WorkflowIoArrayItemSchema
  disabled: boolean
  onChange: (schema: WorkflowIoArrayItemSchema) => void
  onProblem: (message: string | null) => void
}): React.JSX.Element | null {
  /** 解析非空 JSON 数组并写入指定模式字段。 */
  const applyJsonArray = (
    raw: string,
    field: 'enum' | 'allowed_resource_template_uuids'
  ): void => {
    try {
      const trimmed = raw.trim()
      if (!trimmed) {
        onChange(withSchemaField(schema, field, undefined))
        onProblem(null)
        return
      }
      const parsed = JSON.parse(trimmed) as unknown
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('该字段必须是非空 JSON 数组')
      }
      onChange(withSchemaField(schema, field, parsed))
      onProblem(null)
    } catch (value) {
      onProblem(value instanceof Error ? value.message : String(value))
    }
  }

  if ('$slot' in schema) {
    return (
      <label>
        允许的资源模板 UUID（JSON）
        <input
          aria-label={`${label} 允许的资源模板 UUID`}
          defaultValue={jsonValue(schema.allowed_resource_template_uuids)}
          placeholder='["resource-template-uuid"]'
          disabled={disabled}
          onBlur={(event) => applyJsonArray(
            event.target.value,
            'allowed_resource_template_uuids'
          )}
        />
      </label>
    )
  }
  if (schema.type === 'object') return null

  const enumField = (
    <label>
      可选值（JSON）
      <input
        aria-label={`${label} 可选值 JSON`}
        defaultValue={jsonValue(schema.enum)}
        placeholder='["选项一", "选项二"]'
        disabled={disabled}
        onBlur={(event) => applyJsonArray(event.target.value, 'enum')}
      />
    </label>
  )
  if (schema.type === 'boolean') return enumField
  if (schema.type === 'integer' || schema.type === 'number') {
    return (
      <>
        {enumField}
        <OptionalNumberField
          label="最小值"
          ariaLabel={`${label} 最小值`}
          value={schema.minimum}
          integer={schema.type === 'integer'}
          disabled={disabled}
          onChange={(value) => onChange(withSchemaField(
            schema,
            'minimum',
            value
          ))}
        />
        <OptionalNumberField
          label="最大值"
          ariaLabel={`${label} 最大值`}
          value={schema.maximum}
          integer={schema.type === 'integer'}
          disabled={disabled}
          onChange={(value) => onChange(withSchemaField(
            schema,
            'maximum',
            value
          ))}
        />
      </>
    )
  }
  const stringSchema = schema as Extract<
    WorkflowIoArrayItemSchema,
    { type: 'string' }
  >
  return (
    <>
      {enumField}
      <OptionalNumberField
        label="最短长度"
        ariaLabel={`${label} 最短长度`}
        value={stringSchema.minLength}
        integer
        nonNegative
        disabled={disabled}
        onChange={(value) => onChange(withSchemaField(
          stringSchema,
          'minLength',
          value
        ))}
      />
      <OptionalNumberField
        label="最长长度"
        ariaLabel={`${label} 最长长度`}
        value={stringSchema.maxLength}
        integer
        nonNegative
        disabled={disabled}
        onChange={(value) => onChange(withSchemaField(
          stringSchema,
          'maxLength',
          value
        ))}
      />
      <label>
        输入控件
        <select
          aria-label={`${label} 输入控件`}
          value={stringSchema['x-unilabos-editor-control'] ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(withSchemaField(
            stringSchema,
            'x-unilabos-editor-control',
            event.target.value || undefined
          ))}
        >
          <option value="">默认</option>
          <option value="site_selector">位置选择器</option>
        </select>
      </label>
    </>
  )
}

/** 渲染可清空的数值约束字段。 */
function OptionalNumberField({
  label,
  ariaLabel,
  value,
  integer,
  nonNegative = false,
  disabled,
  onChange
}: {
  label: string
  ariaLabel: string
  value: number | undefined
  integer: boolean
  nonNegative?: boolean
  disabled: boolean
  onChange: (value: number | undefined) => void
}): React.JSX.Element {
  return (
    <label>
      {label}
      <input
        type="number"
        step={integer ? 1 : 'any'}
        min={nonNegative ? 0 : undefined}
        aria-label={ariaLabel}
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const raw = event.target.value.trim()
          onChange(raw ? Number(raw) : undefined)
        }}
      />
    </label>
  )
}

/** 渲染输入或输出描述符共用的显示名称与说明字段。 */
export function WorkflowIoDescriptorTextFields<T extends {
  title?: string
  description?: string
}>({
  descriptor,
  disabled,
  onChange
}: {
  descriptor: T
  disabled: boolean
  onChange: (descriptor: T) => void
}): React.JSX.Element {
  return (
    <>
      <label>
        显示名称
        <input
          defaultValue={descriptor.title ?? ''}
          disabled={disabled}
          onBlur={(event) => onChange(withOptionalText(
            descriptor,
            'title',
            event.target.value
          ))}
        />
      </label>
      <label>
        说明
        <input
          defaultValue={descriptor.description ?? ''}
          disabled={disabled}
          onBlur={(event) => onChange(withOptionalText(
            descriptor,
            'description',
            event.target.value
          ))}
        />
      </label>
    </>
  )
}
