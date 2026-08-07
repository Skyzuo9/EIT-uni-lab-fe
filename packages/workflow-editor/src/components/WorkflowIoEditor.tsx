import type {
  WorkflowAuthoringGraph,
  WorkflowInputDescriptor,
  WorkflowJsonValue,
  WorkflowOutputDescriptor
} from '@unilab/services'
import { useState } from 'react'

import {
  addWorkflowInput,
  bindWorkflowInput,
  moveWorkflowInput,
  projectWorkflowIoBindingOptions,
  removeWorkflowInput,
  unbindWorkflowInput,
  updateWorkflowInput,
  updateWorkflowOutput
} from '../utils/workflowIoAuthoring'
import { WorkflowButton } from './WorkflowButton'
import { WorkflowIoGroup } from './WorkflowIoGroup'
import { WorkflowIoOutputGroup } from './WorkflowIoOutputGroup'
import {
  WorkflowIoDescriptorTextFields,
  WorkflowIoSchemaControl
} from './WorkflowIoSchemaControls'
import {
  containsResourceSlot,
  handleLabel,
  inputTargetValue,
  isNullable,
  jsonValue,
  nonNullSchema,
  normalizeInputDescriptor,
  nullableSchema,
  readWorkflowIo,
  recordOrEmpty,
  schemaSummary,
  uniqueName,
  withoutDefault
} from './workflowIoEditorModel'

interface WorkflowIoEditorProps {
  graph: WorkflowAuthoringGraph
  editable: boolean
  onGraphChange: (graph: WorkflowAuthoringGraph) => void
}

/** 编辑工作流（Workflow）输入输出契约及节点句柄绑定。 */
export function WorkflowIoEditor({
  graph,
  editable,
  onGraphChange
}: WorkflowIoEditorProps): React.JSX.Element {
  const [problem, setProblem] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<'input' | 'output'>('input')
  const io = readWorkflowIo(graph)
  const options = projectWorkflowIoBindingOptions(graph)

  const mutate = (operation: () => WorkflowAuthoringGraph): void => {
    try {
      onGraphChange(operation())
      setProblem(null)
    } catch (value) {
      setProblem(value instanceof Error ? value.message : String(value))
    }
  }
  const updateInput = (
    currentName: string,
    descriptor: WorkflowInputDescriptor
  ): void => mutate(() => updateWorkflowInput(
    graph,
    currentName,
    normalizeInputDescriptor(descriptor)
  ))
  const updateOutput = (
    currentName: string,
    descriptor: WorkflowOutputDescriptor
  ): void => mutate(() => updateWorkflowOutput(
    graph,
    currentName,
    descriptor
  ))

  return (
    <section
      className="persistent-authoring__io-editor"
      aria-label="工作流输入与输出编辑器"
    >
      <header>
        <div>
          <strong>编辑工作流参数</strong>
          <span>修改随草稿保存，应用前由 OS 校验。</span>
        </div>
        {!editable && <span>当前模式只读</span>}
      </header>
      {problem && <p role="alert">{problem}</p>}

      <div
        className="persistent-authoring__io-editor-tabs"
        role="tablist"
        aria-label="参数类型"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            return
          }
          event.preventDefault()
          const next = event.key === 'ArrowRight' || event.key === 'End'
            ? 'output'
            : 'input'
          setActiveGroup(next)
          document.getElementById(`workflow-io-tab-${next}`)?.focus()
        }}
      >
        <button
          id="workflow-io-tab-input"
          type="button"
          role="tab"
          aria-controls="workflow-io-panel-input"
          aria-selected={activeGroup === 'input'}
          tabIndex={activeGroup === 'input' ? 0 : -1}
          className={activeGroup === 'input' ? 'is-active' : ''}
          onClick={() => setActiveGroup('input')}
        >
          输入参数 <span>{io.inputs.length}</span>
        </button>
        <button
          id="workflow-io-tab-output"
          type="button"
          role="tab"
          aria-controls="workflow-io-panel-output"
          aria-selected={activeGroup === 'output'}
          tabIndex={activeGroup === 'output' ? 0 : -1}
          className={activeGroup === 'output' ? 'is-active' : ''}
          onClick={() => setActiveGroup('output')}
        >
          输出参数 <span>{io.outputs.length}</span>
        </button>
      </div>

      <div className="persistent-authoring__io-editor-grid">
        <WorkflowIoGroup
          id="input"
          title="输入参数"
          active={activeGroup === 'input'}
        >
          {io.inputs.length === 0 && (
            <p className="persistent-authoring__io-editor-empty">
              暂无输入参数。需要从工作流外部传值时再添加。
            </p>
          )}
          <ol>
            {io.inputs.map((descriptor, index) => (
              <li
                key={descriptor.name}
                data-workflow-input-name={descriptor.name}
              >
                <details>
                  <summary className="persistent-authoring__io-editor-row-heading">
                    <span className="persistent-authoring__io-editor-identity">
                      <span aria-hidden="true">◇</span>
                      <code>{descriptor.name}</code>
                    </span>
                    <span className="persistent-authoring__io-editor-type">
                      {schemaSummary(descriptor.schema)}
                    </span>
                    <span className="persistent-authoring__io-editor-status">
                      {descriptor.required
                        ? '必填'
                        : Object.hasOwn(descriptor, 'default')
                          ? '有默认值'
                          : '选填'}
                    </span>
                  <span className="persistent-authoring__io-editor-row-actions">
                    <WorkflowButton
                      type="button"
                      disabled={!editable || index === 0}
                      disabledReason={!editable
                        ? '当前模式只允许查看工作流输入'
                        : '该输入已经位于第一项'}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        mutate(() => moveWorkflowInput(
                          graph,
                          descriptor.name,
                          'up'
                        ))
                      }}
                    >
                      上移
                    </WorkflowButton>
                    <WorkflowButton
                      type="button"
                      disabled={!editable || index === io.inputs.length - 1}
                      disabledReason={!editable
                        ? '当前模式只允许查看工作流输入'
                        : '该输入已经位于最后一项'}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        mutate(() => moveWorkflowInput(
                          graph,
                          descriptor.name,
                          'down'
                        ))
                      }}
                    >
                      下移
                    </WorkflowButton>
                    <WorkflowButton
                      type="button"
                      disabled={!editable}
                      disabledReason="当前模式只允许查看工作流输入"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        mutate(() => removeWorkflowInput(
                          graph,
                          descriptor.name
                        ))
                      }}
                    >
                      删除
                    </WorkflowButton>
                    <span className="persistent-authoring__io-editor-expand">
                      详情
                    </span>
                  </span>
                  </summary>
                  <div className="persistent-authoring__io-editor-fields">
                <label>
                  变量名
                  <input
                    aria-label="输入名称"
                    defaultValue={descriptor.name}
                    disabled={!editable}
                    onBlur={(event) => {
                      if (event.target.value !== descriptor.name) {
                        updateInput(descriptor.name, {
                          ...descriptor,
                          name: event.target.value
                        })
                      }
                    }}
                  />
                </label>
                <WorkflowIoSchemaControl
                  label={`${descriptor.name} 入参`}
                  schema={descriptor.schema}
                  disabled={!editable}
                  onProblem={setProblem}
                  onChange={(schema) => updateInput(descriptor.name, {
                    ...descriptor,
                    schema
                  })}
                />
                <label className="persistent-authoring__io-check">
                  <input
                    type="checkbox"
                    checked={descriptor.required}
                    disabled={
                      !editable || (
                        containsResourceSlot(descriptor.schema) &&
                        !isNullable(descriptor.schema)
                      )
                    }
                    onChange={(event) => updateInput(descriptor.name, {
                      ...descriptor,
                      required: event.target.checked
                    })}
                  />
                  必填
                </label>
                <label className="persistent-authoring__io-check">
                  <input
                    type="checkbox"
                    checked={isNullable(descriptor.schema)}
                    disabled={!editable}
                    onChange={(event) => updateInput(descriptor.name, {
                      ...descriptor,
                      schema: event.target.checked
                        ? nullableSchema(descriptor.schema)
                        : nonNullSchema(descriptor.schema),
                      required: event.target.checked
                        ? false
                        : containsResourceSlot(descriptor.schema)
                          ? true
                          : descriptor.required
                    })}
                  />
                  允许为空
                </label>
                <label>
                  默认值（JSON）
                  <input
                    key={`${descriptor.name}:${jsonValue(descriptor.default)}`}
                    defaultValue={'default' in descriptor
                      ? jsonValue(descriptor.default)
                      : ''}
                    placeholder={descriptor.required
                      ? '必填参数不使用默认值'
                      : '请输入 JSON 值'}
                    disabled={
                      !editable || descriptor.required ||
                      containsResourceSlot(descriptor.schema)
                    }
                    onBlur={(event) => {
                      const raw = event.target.value.trim()
                      mutate(() => updateWorkflowInput(
                        graph,
                        descriptor.name,
                        normalizeInputDescriptor(raw
                          ? {
                              ...descriptor,
                              required: false,
                              default: JSON.parse(raw) as WorkflowJsonValue
                            }
                          : withoutDefault(descriptor))
                      ))
                    }}
                  />
                </label>
                <WorkflowIoDescriptorTextFields
                  descriptor={descriptor}
                  disabled={!editable}
                  onChange={(next) => updateInput(descriptor.name, next)}
                />
                <label>
                  绑定到节点入参
                  <select
                    aria-label="节点入参绑定"
                    value=""
                    disabled={!editable || options.inputTargets.length === 0}
                    onChange={(event) => {
                      if (!event.target.value) return
                      const target = options.inputTargets.find((item) =>
                        inputTargetValue(item) === event.target.value
                      )
                      if (!target) return
                      mutate(() => bindWorkflowInput(graph, {
                        parameter: descriptor.name,
                        ...target
                      }))
                    }}
                  >
                    <option value="">选择节点入参…</option>
                    {options.inputTargets.map((target) => (
                      <option
                        key={`${target.workflowNodeUuid}:${target.targetHandleUuid}`}
                        value={inputTargetValue(target)}
                        data-workflow-node-uuid={target.workflowNodeUuid}
                        data-workflow-handle-template-uuid={
                          target.targetHandleUuid
                        }
                      >
                        {handleLabel(
                          graph,
                          target.workflowNodeUuid,
                          target.targetHandleUuid
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <BindingList
                  graph={graph}
                  parameter={descriptor.name}
                  editable={editable}
                  onUnbind={(nodeUuid, handleUuid) => mutate(() =>
                    unbindWorkflowInput(graph, nodeUuid, handleUuid)
                  )}
                />
                  </div>
                </details>
              </li>
            ))}
          </ol>
          <WorkflowButton
            type="button"
            className="persistent-authoring__io-editor-add"
            disabled={!editable}
            disabledReason="当前模式只允许查看工作流输入"
            onClick={() => mutate(() => addWorkflowInput(graph, {
              name: uniqueName(io.inputs.map(({ name }) => name), 'input'),
              schema: { type: 'string' },
              required: true
            }))}
          >
            添加输入参数
          </WorkflowButton>
        </WorkflowIoGroup>

        <WorkflowIoOutputGroup
          graph={graph}
          editable={editable}
          active={activeGroup === 'output'}
          onProblem={setProblem}
          mutate={mutate}
          updateOutput={updateOutput}
        />

      </div>
    </section>
  )
}


function BindingList({
  graph,
  parameter,
  editable,
  onUnbind
}: {
  graph: WorkflowAuthoringGraph
  parameter: string
  editable: boolean
  onUnbind: (nodeUuid: string, handleUuid: string) => void
}): React.JSX.Element | null {
  const bindings = graph.nodes.flatMap((node) => {
    const inputBindings = recordOrEmpty(
      recordOrEmpty(recordOrEmpty(node.meta_data).unilab).input_bindings
    )
    return Object.entries(inputBindings)
      .filter(([, value]) => recordOrEmpty(value).parameter === parameter)
      .map(([handleUuid]) => ({
        nodeUuid: String(node.uuid),
        handleUuid
      }))
  })
  if (bindings.length === 0) return null
  return (
    <div className="persistent-authoring__io-bindings">
      <small>已绑定到：</small>
      {bindings.map(({ nodeUuid, handleUuid }) => (
        <span key={`${nodeUuid}:${handleUuid}`}>
          {handleLabel(graph, nodeUuid, handleUuid)}
          <WorkflowButton
            type="button"
            data-workflow-node-uuid={nodeUuid}
            data-workflow-handle-template-uuid={handleUuid}
            disabled={!editable}
            disabledReason="当前模式只允许查看工作流输入绑定"
            onClick={() => onUnbind(nodeUuid, handleUuid)}
          >
            解除绑定
          </WorkflowButton>
        </span>
      ))}
    </div>
  )
}
