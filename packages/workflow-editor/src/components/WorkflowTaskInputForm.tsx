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

interface WorkflowTaskInputFormProps {
  aggregate: WorkflowAuthoringAggregate
  form?: WorkflowTaskInputFormState
  busy?: boolean
  problem?: string | null
  onChange: (name: string, state: WorkflowTaskInputFieldState) => void
  onSubmit?: () => void
  onCancel?: () => void
  onProblem?: (message: string | null) => void
}

export function WorkflowTaskInputForm({
  aggregate,
  form = createWorkflowTaskInputForm(aggregate),
  busy = false,
  problem = null,
  onChange,
  onSubmit,
  onCancel,
  onProblem
}: WorkflowTaskInputFormProps): React.JSX.Element {
  const update = (
    descriptor: WorkflowInputDescriptor,
    state: WorkflowTaskInputFieldState
  ): boolean => {
    try {
      onChange(descriptor.name, state)
      return true
    } catch (error) {
      onProblem?.(errorMessage(error))
      return false
    }
  }
  return (
    <section
      className="workflow-task-input-form"
      aria-label="Workflow Task 输入表单"
    >
      <header>
        <div>
          <strong>Workflow Task 输入</strong>
          <span>使用 Applied revision {form.appliedRevision}</span>
        </div>
        <p>
          未填写字段保持省略，由 OS 应用并冻结 default；Candidate 不参与本次运行。
        </p>
      </header>

      {problem && <p className="workflow-runtime__problem" role="alert">{problem}</p>}

      {form.fields.length === 0 ? (
        <p>当前 Applied Workflow 没有外部输入。</p>
      ) : (
        <ol>
          {form.fields.map(({ descriptor, state }) => {
            const resourceSlot = containsResourceSlotInput(descriptor.schema)
            return (
              <li
                key={descriptor.name}
                data-workflow-task-input-name={descriptor.name}
              >
                <div className="workflow-task-input-form__heading">
                  <strong>{descriptor.title || descriptor.name}</strong>
                  <code>{schemaLabel(descriptor.schema)}</code>
                  {descriptor.required && <span>必填</span>}
                </div>
                {descriptor.description && <p>{descriptor.description}</p>}
                {Object.hasOwn(descriptor, 'default') && (
                  <p>
                    默认 default：<code>{jsonText(descriptor.default)}</code>
                  </p>
                )}
                <label>
                  输入状态
                  <select
                    aria-label={`${descriptor.name} 输入状态`}
                    value={state.kind}
                    disabled={busy || resourceSlot}
                    onChange={(event) => update(
                      descriptor,
                      stateForKind(descriptor.schema, event.target.value)
                    )}
                  >
                    <option value="untouched">省略 (untouched)</option>
                    <option
                      value="explicit_null"
                      disabled={!isNullableWorkflowInputSchema(
                        descriptor.schema
                      )}
                    >
                      显式空值 (explicit null)
                    </option>
                    <option value="value">明确值 (value)</option>
                  </select>
                </label>
                {resourceSlot ? (
                  <div>
                    <label>
                      ResourceSlot
                      <input
                        aria-label={`${descriptor.name} ResourceSlot`}
                        disabled
                        placeholder="ResourceSlot selector 暂不支持"
                      />
                    </label>
                    <span>ResourceSlot selector 本轮尚不可用</span>
                  </div>
                ) : state.kind === 'value' ? (
                  <WorkflowValueControl
                    key={`${form.appliedRevision}:${state.kind}`}
                    name={descriptor.name}
                    schema={descriptor.schema}
                    value={state.value}
                    disabled={busy}
                    onChange={(value) => update(descriptor, {
                      kind: 'value',
                      value
                    })}
                    onProblem={onProblem}
                  />
                ) : null}
              </li>
            )
          })}
        </ol>
      )}

      {(onSubmit || onCancel) && (
        <footer>
          {onCancel && (
            <button type="button" disabled={busy} onClick={onCancel}>
              取消
            </button>
          )}
          {onSubmit && (
            <button
              type="button"
              className="workflow-runtime__primary"
              disabled={busy}
              onClick={onSubmit}
            >
              {busy ? '创建中…' : '确认并创建 Task'}
            </button>
          )}
        </footer>
      )}
    </section>
  )
}

function WorkflowValueControl({
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
    return <input disabled aria-label={`${name} ResourceSlot`} />
  }
  if (base.type === 'string') {
    if (base.enum) {
      return (
        <label>
          明确值
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
        明确值
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
        明确值
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
        明确值
        <select
          aria-label={`${name} 明确值`}
          value={value === true ? 'true' : 'false'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === 'true')}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      </label>
    )
  }
  return (
    <label>
      明确值 JSON
      <textarea
        aria-label={`${name} 明确值 JSON`}
        defaultValue={jsonText(value)}
        disabled={disabled}
        onBlur={(event) => {
          try {
            const parsed = JSON.parse(event.target.value) as unknown
            if (base.type === 'array' && !Array.isArray(parsed)) {
              throw new Error(`${name} 必须是 JSON array`)
            }
            if (
              base.type === 'object' &&
              (
                !parsed ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
              )
            ) throw new Error(`${name} 必须是 JSON object`)
            if (onChange(parsed as WorkflowJsonValue)) onProblem?.(null)
          } catch (error) {
            onProblem?.(errorMessage(error))
          }
        }}
      />
    </label>
  )
}

function stateForKind(
  schema: WorkflowValueSchema,
  kind: string
): WorkflowTaskInputFieldState {
  if (kind === 'untouched') return { kind: 'untouched' }
  if (kind === 'explicit_null') return { kind: 'explicit_null' }
  if (kind === 'value') return {
    kind: 'value',
    value: emptyValue(schema)
  }
  throw new Error(`未知 Workflow input 状态：${kind}`)
}

function emptyValue(schema: WorkflowValueSchema): WorkflowJsonValue {
  const base = 'anyOf' in schema ? schema.anyOf[0] : schema
  if ('$slot' in base) {
    throw new Error('ResourceSlot selector 本轮尚不可用')
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

function boundedZero(minimum?: number, maximum?: number): number {
  if (minimum !== undefined && minimum > 0) return minimum
  if (maximum !== undefined && maximum < 0) return maximum
  return 0
}

function schemaLabel(schema: WorkflowValueSchema): string {
  const base = 'anyOf' in schema ? schema.anyOf[0] : schema
  const nullable = 'anyOf' in schema ? ' | null' : ''
  if ('$slot' in base) return `ResourceSlot${nullable}`
  if (base.type === 'array') {
    return `list[${schemaLabel(base.items)}]${nullable}`
  }
  return `${base.type}${nullable}`
}

function jsonText(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value)
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
