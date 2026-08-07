import type {
  WorkflowAuthoringGraph,
  WorkflowOutputDescriptor
} from '@unilab/services'

import {
  addWorkflowOutput,
  bindWorkflowOutput,
  moveWorkflowOutput,
  projectWorkflowIoBindingOptions,
  removeWorkflowOutput,
  unbindWorkflowOutput
} from '../utils/workflowIoAuthoring'
import { WorkflowButton } from './WorkflowButton'
import { WorkflowIoGroup } from './WorkflowIoGroup'
import {
  WorkflowIoDescriptorTextFields,
  WorkflowIoSchemaControl
} from './WorkflowIoSchemaControls'
import {
  bindingValue,
  handleLabel,
  isNullable,
  nonNullSchema,
  nullableSchema,
  readWorkflowIo,
  schemaSummary,
  sourceValue,
  uniqueName
} from './workflowIoEditorModel'

interface WorkflowIoOutputGroupProps {
  graph: WorkflowAuthoringGraph
  editable: boolean
  active: boolean
  onProblem: (message: string | null) => void
  mutate: (operation: () => WorkflowAuthoringGraph) => void
  updateOutput: (
    currentName: string,
    descriptor: WorkflowOutputDescriptor
  ) => void
}

/**
 * 编辑工作流（Workflow）输出契约及其数据来源绑定。
 *
 * @param props 当前候选图、编辑权限、变更事务与错误投影接口。
 * @returns 输出参数面板；隐式输出保持操作系统（OS）只读。
 */
export function WorkflowIoOutputGroup({
  graph,
  editable,
  active,
  onProblem,
  mutate,
  updateOutput
}: WorkflowIoOutputGroupProps): React.JSX.Element {
  const io = readWorkflowIo(graph)
  const options = projectWorkflowIoBindingOptions(graph)

  return (
    <WorkflowIoGroup id="output" title="输出参数" active={active}>
      {io.outputs.length === 0 && (
        <p className="persistent-authoring__io-editor-empty">
          暂无输出参数。需要向工作流外部返回结果时再添加。
        </p>
      )}
      <ol>
        {io.outputs.map((descriptor, index) => {
          const readonly = descriptor.implicit || !editable
          const binding = io.outputBindings[descriptor.name]
          return (
            <li
              key={descriptor.name}
              data-workflow-output-name={descriptor.name}
              aria-readonly={descriptor.implicit ? 'true' : undefined}
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
                    {descriptor.implicit ? '系统生成 · OS 管理' : '已配置'}
                  </span>
                  <span className="persistent-authoring__io-editor-row-actions">
                    {!descriptor.implicit && (
                      <>
                        <WorkflowButton
                          type="button"
                          disabled={!editable || index === 0}
                          disabledReason={!editable
                            ? '当前模式只允许查看工作流输出'
                            : '该输出已经位于第一项'}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            mutate(() => moveWorkflowOutput(
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
                          disabled={!editable || index === io.outputs.length - 1}
                          disabledReason={!editable
                            ? '当前模式只允许查看工作流输出'
                            : '该输出已经位于最后一项'}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            mutate(() => moveWorkflowOutput(
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
                          disabledReason="当前模式只允许查看工作流输出"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            mutate(() => removeWorkflowOutput(
                              graph,
                              descriptor.name
                            ))
                          }}
                        >
                          删除
                        </WorkflowButton>
                      </>
                    )}
                    <span className="persistent-authoring__io-editor-expand">
                      详情
                    </span>
                  </span>
                </summary>
                <div className="persistent-authoring__io-editor-fields">
                  <label>
                    变量名
                    <input
                      aria-label="输出名称"
                      defaultValue={descriptor.name}
                      disabled={readonly}
                      onBlur={(event) => {
                        if (event.target.value !== descriptor.name) {
                          updateOutput(descriptor.name, {
                            ...descriptor,
                            name: event.target.value
                          })
                        }
                      }}
                    />
                  </label>
                  <WorkflowIoSchemaControl
                    label={`${descriptor.name} 出参`}
                    schema={descriptor.schema}
                    disabled={readonly}
                    onProblem={onProblem}
                    onChange={(schema) => updateOutput(descriptor.name, {
                      ...descriptor,
                      schema
                    })}
                  />
                  <label className="persistent-authoring__io-check">
                    <input
                      type="checkbox"
                      checked={isNullable(descriptor.schema)}
                      disabled={readonly}
                      onChange={(event) => updateOutput(descriptor.name, {
                        ...descriptor,
                        schema: event.target.checked
                          ? nullableSchema(descriptor.schema)
                          : nonNullSchema(descriptor.schema)
                      })}
                    />
                    允许为空
                  </label>
                  <WorkflowIoDescriptorTextFields
                    descriptor={descriptor}
                    disabled={readonly}
                    onChange={(next) => updateOutput(descriptor.name, next)}
                  />
                  <label>
                    数据来源
                    <select
                      aria-label="工作流出参绑定"
                      value={bindingValue(binding)}
                      disabled={readonly}
                      onChange={(event) => {
                        const value = event.target.value
                        if (!value) {
                          mutate(() => unbindWorkflowOutput(
                            graph,
                            descriptor.name
                          ))
                          return
                        }
                        const source = options.outputSources.find(
                          (option) => sourceValue(option) === value
                        )
                        if (!source) return
                        mutate(() => bindWorkflowOutput(
                          graph,
                          descriptor.name,
                          source.kind === 'workflow_input'
                            ? source
                            : {
                                kind: 'node_output',
                                workflow_node_uuid: source.workflowNodeUuid,
                                source_handle_uuid: source.sourceHandleUuid
                              }
                        ))
                      }}
                    >
                      <option value="">选择数据来源…</option>
                      {options.outputSources.map((source) => (
                        <option
                          key={sourceValue(source)}
                          value={sourceValue(source)}
                          data-workflow-node-uuid={source.kind === 'node_output'
                            ? source.workflowNodeUuid
                            : undefined}
                          data-workflow-handle-template-uuid={
                            source.kind === 'node_output'
                              ? source.sourceHandleUuid
                              : undefined
                          }
                        >
                          {source.kind === 'workflow_input'
                            ? `工作流输入：${source.parameter}`
                            : handleLabel(
                                graph,
                                source.workflowNodeUuid,
                                source.sourceHandleUuid
                              )}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </li>
          )
        })}
      </ol>
      <WorkflowButton
        type="button"
        className="persistent-authoring__io-editor-add"
        disabled={!editable}
        disabledReason="当前模式只允许查看工作流输出"
        onClick={() => mutate(() => addWorkflowOutput(graph, {
          name: uniqueName(io.outputs.map(({ name }) => name), 'output'),
          schema: { type: 'object' },
          implicit: false
        }))}
      >
        添加输出参数
      </WorkflowButton>
    </WorkflowIoGroup>
  )
}
