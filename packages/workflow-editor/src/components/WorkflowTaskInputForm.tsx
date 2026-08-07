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
  type WorkflowResourceSlotOptionsState
} from '../utils/workflowResourceSlotOptions'
import { WorkflowButton } from './WorkflowButton'
import {
  compatibleOptions,
  errorMessage,
  jsonText,
  renderWorkflowResourceSlotControl,
  resourceSlotAvailabilityMessage,
  schemaLabel,
  stateForKind,
  untouchedLabel,
  WorkflowValueControl
} from './WorkflowTaskInputControls'

interface WorkflowTaskInputFormProps {
  aggregate: WorkflowAuthoringAggregate
  form?: WorkflowTaskInputFormState
  busy?: boolean
  problem?: string | null
  resourceSlotOptions?: WorkflowResourceSlotOptionsState
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
  resourceSlotOptions,
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
      aria-label="工作流运行输入表单"
    >
      <header>
        <div>
          <strong>本次运行输入</strong>
          <span>使用已应用版本 {form.appliedRevision}</span>
        </div>
        <p>
          本次运行使用已应用版本；未覆盖的参数由 OS 使用固定默认值。
        </p>
      </header>

      {problem && <p className="workflow-runtime__problem" role="alert">{problem}</p>}

      {form.fields.length === 0 ? (
        <p>当前已应用的工作流没有外部输入。</p>
      ) : (
        <ol>
          {form.fields.map(({ descriptor, state }) => {
            const resourceSlot = containsResourceSlotInput(descriptor.schema)
            const compatibleResourceSlotOptions = resourceSlot
              ? compatibleOptions(descriptor.schema, resourceSlotOptions)
              : []
            const resourceSlotProblem = resourceSlot
              ? resourceSlotAvailabilityMessage(
                  resourceSlotOptions,
                  compatibleResourceSlotOptions
                )
              : null
            return (
              <li
                key={descriptor.name}
                data-workflow-task-input-name={descriptor.name}
              >
                <div className="workflow-task-input-form__identity">
                  <div className="workflow-task-input-form__heading">
                    <strong>{descriptor.title || descriptor.name}</strong>
                    <code>{schemaLabel(descriptor.schema)}</code>
                    {descriptor.required && <span>必填</span>}
                  </div>
                  {descriptor.description && <p>{descriptor.description}</p>}
                </div>
                <div className="workflow-task-input-form__default">
                  {Object.hasOwn(descriptor, 'default') ? (
                    <p>
                      默认值：<code>{jsonText(descriptor.default)}</code>
                    </p>
                  ) : (
                    <span>无默认值</span>
                  )}
                </div>
                <div className="workflow-task-input-form__control">
                  <label className="workflow-task-input-form__state">
                    本次取值
                    <select
                      aria-label={`${descriptor.name} 输入状态`}
                      value={state.kind}
                      disabled={busy}
                      onChange={(event) => update(
                        descriptor,
                        stateForKind(
                          descriptor.schema,
                          event.target.value,
                          compatibleResourceSlotOptions
                        )
                      )}
                    >
                      <option value="untouched">
                        {untouchedLabel(descriptor)}
                      </option>
                      <option
                        value="explicit_null"
                        disabled={!isNullableWorkflowInputSchema(
                          descriptor.schema
                        )}
                      >
                        传入空值
                      </option>
                      <option
                        value="value"
                        disabled={Boolean(resourceSlotProblem)}
                      >
                        自定义值
                      </option>
                    </select>
                  </label>
                  {resourceSlot ? (
                    renderWorkflowResourceSlotControl({
                      name: descriptor.name,
                      schema: descriptor.schema,
                      state,
                      options: compatibleResourceSlotOptions,
                      problem: resourceSlotProblem,
                      disabled: busy || state.kind === 'explicit_null',
                      onChange: (next) => update(descriptor, next)
                    })
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
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {(onSubmit || onCancel) && (
        <footer>
          {onCancel && (
            <WorkflowButton
              type="button"
              disabled={busy}
              disabledReason="正在创建工作流任务，请等待 OS 返回结果"
              onClick={onCancel}
            >
              取消
            </WorkflowButton>
          )}
          {onSubmit && (
            <WorkflowButton
              type="button"
              className="workflow-runtime__primary"
              disabled={busy}
              disabledReason="正在创建工作流任务，请等待 OS 返回结果"
              onClick={onSubmit}
            >
              {busy ? '正在创建任务…' : '使用以上参数运行'}
            </WorkflowButton>
          )}
        </footer>
      )}
    </section>
  )
}
