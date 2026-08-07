import type {
  WorkflowAuthoringAggregate,
  WorkflowInputDescriptor,
  WorkflowJsonValue,
  WorkflowValueSchema
} from '@unilab/services'

import {
  containsResourceSlotInput,
  createWorkflowTaskInputForm,
  isNullableWorkflowInputSchema,
  type WorkflowTaskInputFieldState,
  type WorkflowTaskInputFormState
} from '../utils/workflowTaskInputForm'
import {
  filterWorkflowResourceSlotOptions,
  type WorkflowResourceSlotOption,
  type WorkflowResourceSlotOptionsState
} from '../utils/workflowResourceSlotOptions'
import { WorkflowButton } from './WorkflowButton'

export function untouchedLabel(descriptor: WorkflowInputDescriptor): string {
  return Object.hasOwn(descriptor, 'default')
    ? '使用工作流默认值'
    : '本次不传入'
}

export function renderWorkflowResourceSlotControl({
  name,
  schema,
  state,
  options,
  problem,
  disabled,
  onChange
}: {
  name: string
  schema: WorkflowValueSchema
  state: WorkflowTaskInputFieldState
  options: readonly WorkflowResourceSlotOption[]
  problem: string | null
  disabled: boolean
  onChange: (state: WorkflowTaskInputFieldState) => boolean
}): React.JSX.Element {
  const base = nonNullSchema(schema)
  const unavailable = disabled || problem !== null
  if ('$slot' in base) {
    const value = state.kind === 'value'
      ? resourceSlotUuid(state.value)
      : ''
    return (
      <div>
        <label>
          资源位
          <select
            aria-label={`${name} 资源位`}
            value={value}
            disabled={unavailable}
            onChange={(event) => onChange(
              event.target.value === ''
                ? { kind: 'untouched' }
                : {
                    kind: 'value',
                    value: { uuid: event.target.value }
                  }
            )}
          >
            <option value="">请选择物料</option>
            {options.map((option) => (
              <option
                key={option.materialUuid}
                value={option.materialUuid}
              >
                {option.displayLabel}
              </option>
            ))}
          </select>
        </label>
        {problem && <span role="status">{problem}</span>}
      </div>
    )
  }

  const values = state.kind === 'value' && Array.isArray(state.value)
    ? state.value.map(resourceSlotUuid)
    : []
  const updateValues = (next: readonly string[]): boolean => onChange({
    kind: 'value',
    value: next.map((uuid) => ({ uuid }))
  })
  return (
    <div>
      {values.map((value, index) => (
        <div key={`${index}:${value}`}>
          <label>
            资源位 {index + 1}
            <select
              aria-label={`${name} 资源位 ${index + 1}`}
              value={value}
              disabled={unavailable}
              onChange={(event) => {
                const next = [...values]
                next[index] = event.target.value
                updateValues(next)
              }}
            >
              {options.map((option) => (
                <option
                  key={option.materialUuid}
                  value={option.materialUuid}
                >
                  {option.displayLabel}
                </option>
              ))}
            </select>
          </label>
          <WorkflowButton
            type="button"
            aria-label={`${name} 上移 ${index + 1}`}
            disabled={unavailable || index === 0}
            disabledReason={problem ?? (disabled
              ? '正在创建工作流任务，暂时不能调整物料顺序'
              : '该物料已经位于第一项')}
            onClick={() => {
              const next = [...values]
              const previous = next[index - 1]
              const current = next[index]
              if (previous === undefined || current === undefined) return
              next[index - 1] = current
              next[index] = previous
              updateValues(next)
            }}
          >
            上移
          </WorkflowButton>
          <WorkflowButton
            type="button"
            aria-label={`${name} 删除 ${index + 1}`}
            disabled={unavailable}
            disabledReason={problem ?? '正在创建工作流任务，暂时不能删除物料'}
            onClick={() => updateValues(values.filter((_, itemIndex) =>
              itemIndex !== index
            ))}
          >
            删除
          </WorkflowButton>
        </div>
      ))}
      <WorkflowButton
        type="button"
        aria-label={`${name} 添加资源位`}
        disabled={unavailable || options.length === 0}
        disabledReason={problem ?? (disabled
          ? '正在创建工作流任务，暂时不能添加物料'
          : '当前没有兼容的可选物料')}
        onClick={() => {
          const first = options[0]
          if (first) updateValues([...values, first.materialUuid])
        }}
      >
        添加资源位
      </WorkflowButton>
      {problem && <span role="status">{problem}</span>}
    </div>
  )
}

export function WorkflowValueControl({
  name,
  schema,
  value,
  disabled,
  onChange,
  onProblem
}: {
  name: string
  schema: WorkflowValueSchema
  value: WorkflowJsonValue
  disabled: boolean
  onChange: (value: WorkflowJsonValue) => boolean
  onProblem?: (message: string | null) => void
}): React.JSX.Element {
  const base = 'anyOf' in schema ? schema.anyOf[0] : schema
  if ('$slot' in base) {
    return <input disabled aria-label={`${name} 资源位`} />
  }
  if (base.type === 'string') {
    if (base.enum) {
      return (
        <label>
          参数值
          <select
            aria-label={`${name} 明确值`}
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          >
            {base.enum.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      )
    }
    return (
      <label>
        参数值
        <input
          type="text"
          aria-label={`${name} 明确值`}
          value={typeof value === 'string' ? value : ''}
          minLength={base.minLength}
          maxLength={base.maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }
  if (base.type === 'integer' || base.type === 'number') {
    return (
      <label>
        参数值
        <input
          type="number"
          step={base.type === 'integer' ? 1 : 'any'}
          min={base.minimum}
          max={base.maximum}
          aria-label={`${name} 明确值`}
          value={typeof value === 'number' ? value : 0}
          disabled={disabled}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber
            if (Number.isFinite(next)) onChange(next)
          }}
        />
      </label>
    )
  }
  if (base.type === 'boolean') {
    return (
      <label>
        参数值
        <select
          aria-label={`${name} 明确值`}
          value={value === true ? 'true' : 'false'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === 'true')}
        >
          <option value="false">否</option>
          <option value="true">是</option>
        </select>
      </label>
    )
  }
  return (
    <label>
      参数值（JSON）
      <textarea
        aria-label={`${name} 明确值 JSON`}
        defaultValue={jsonText(value)}
        disabled={disabled}
        onBlur={(event) => {
          try {
            const parsed = JSON.parse(event.target.value) as unknown
            if (base.type === 'array' && !Array.isArray(parsed)) {
              throw new Error(`${name} 必须是 JSON 数组`)
            }
            if (
              base.type === 'object' &&
              (
                !parsed ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
              )
            ) throw new Error(`${name} 必须是 JSON 对象`)
            if (onChange(parsed as WorkflowJsonValue)) onProblem?.(null)
          } catch (error) {
            onProblem?.(errorMessage(error))
          }
        }}
      />
    </label>
  )
}

export function stateForKind(
  schema: WorkflowValueSchema,
  kind: string,
  resourceSlotOptions: readonly WorkflowResourceSlotOption[] = []
): WorkflowTaskInputFieldState {
  if (kind === 'untouched') return { kind: 'untouched' }
  if (kind === 'explicit_null') return { kind: 'explicit_null' }
  if (kind === 'value') return {
    kind: 'value',
    value: emptyValue(schema, resourceSlotOptions)
  }
  throw new Error(`未知工作流入参状态：${kind}`)
}

export function emptyValue(
  schema: WorkflowValueSchema,
  resourceSlotOptions: readonly WorkflowResourceSlotOption[] = []
): WorkflowJsonValue {
  const base = nonNullSchema(schema)
  if ('$slot' in base) {
    const first = resourceSlotOptions[0]
    if (!first) throw new Error('没有兼容的物料资源位可选择')
    return { uuid: first.materialUuid }
  }
  switch (base.type) {
    case 'string': return base.enum?.[0] ?? ''
    case 'integer':
    case 'number': return base.enum?.[0] ?? boundedZero(
      base.minimum,
      base.maximum
    )
    case 'boolean': return base.enum?.[0] ?? false
    case 'object': return {}
    case 'array': return []
  }
}

export function nonNullSchema(
  schema: WorkflowValueSchema
): Exclude<WorkflowValueSchema, { anyOf: unknown }> {
  return 'anyOf' in schema ? schema.anyOf[0] : schema
}

export function compatibleOptions(
  schema: WorkflowValueSchema,
  state?: WorkflowResourceSlotOptionsState
): readonly WorkflowResourceSlotOption[] {
  if (!state || state.kind !== 'ready') return []
  const base = nonNullSchema(schema)
  const slot = '$slot' in base
    ? base
    : base.type === 'array' && '$slot' in base.items
      ? base.items
      : null
  return filterWorkflowResourceSlotOptions(
    state.options,
    slot?.allowed_resource_template_uuids
  )
}

export function resourceSlotAvailabilityMessage(
  state: WorkflowResourceSlotOptionsState | undefined,
  compatible: readonly WorkflowResourceSlotOption[]
): string | null {
  if (!state) return '物料资源位选项尚未加载，当前不可用'
  if (state.kind !== 'ready') return state.message
  return compatible.length === 0
    ? '没有与工作流入参类型兼容的物料，请先创建或修正模板'
    : null
}

export function resourceSlotUuid(value: unknown): string {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).uuid === 'string'
  ) return (value as Record<string, string>).uuid ?? ''
  return ''
}

export function boundedZero(minimum?: number, maximum?: number): number {
  if (minimum !== undefined && minimum > 0) return minimum
  if (maximum !== undefined && maximum < 0) return maximum
  return 0
}

export function schemaLabel(schema: WorkflowValueSchema): string {
  const base = 'anyOf' in schema ? schema.anyOf[0] : schema
  const nullable = 'anyOf' in schema ? ' · 可空' : ''
  if ('$slot' in base) return `资源位${nullable}`
  if (base.type === 'array') {
    return `列表<${schemaLabel(base.items)}>${nullable}`
  }
  const labels: Record<string, string> = {
    string: '文本',
    integer: '整数',
    number: '数值',
    boolean: '布尔值',
    object: '对象'
  }
  return `${labels[base.type] ?? base.type}${nullable}`
}

export function jsonText(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value)
}

export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
