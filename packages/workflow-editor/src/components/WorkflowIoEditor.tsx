import type {
  WorkflowAuthoringGraph,
  WorkflowInputDescriptor,
  WorkflowJsonValue,
  WorkflowOutputBinding,
  WorkflowOutputDescriptor,
  WorkflowValueSchema
} from '@unilab/services'
import { useState } from 'react'

import {
  addWorkflowInput,
  addWorkflowOutput,
  bindWorkflowInput,
  bindWorkflowOutput,
  projectWorkflowIoBindingOptions,
  removeWorkflowInput,
  removeWorkflowOutput,
  unbindWorkflowOutput,
  updateWorkflowInput,
  updateWorkflowOutput
} from '../utils/workflowIoAuthoring'

interface WorkflowIoEditorProps {
  graph: WorkflowAuthoringGraph
  editable: boolean
  onGraphChange: (graph: WorkflowAuthoringGraph) => void
}

type SchemaMode =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'object'
  | 'resource_slot'
  | 'resource_slot_list'

export function WorkflowIoEditor({
  graph,
  editable,
  onGraphChange
}: WorkflowIoEditorProps): React.JSX.Element {
  const [problem, setProblem] = useState<string | null>(null)
  const io = workflowIo(graph)
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
      aria-label="Workflow I/O 编辑器"
    >
      <header>
        <div>
          <strong>Candidate Workflow I/O</strong>
          <span>保存时由 OS 生成 canonical Python，并在 Apply 前验证。</span>
        </div>
        {!editable && <span>当前模式只读</span>}
      </header>
      {problem && <p role="alert">{problem}</p>}

      <div className="persistent-authoring__io-editor-grid">
        <ContractEditor title="Workflow Inputs">
          <ol>
            {io.inputs.map((descriptor) => (
              <li
                key={descriptor.name}
                data-workflow-input-name={descriptor.name}
              >
                <div className="persistent-authoring__io-editor-row-heading">
                  <code>{descriptor.name}</code>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => mutate(() =>
                      removeWorkflowInput(graph, descriptor.name)
                    )}
                  >
                    删除
                  </button>
                </div>
                <label>
                  Name
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
                <SchemaControl
                  label={`${descriptor.name} input type`}
                  schema={descriptor.schema}
                  disabled={!editable}
                  onChange={(schema) => updateInput(descriptor.name, {
                    ...descriptor,
                    schema
                  })}
                />
                <label className="persistent-authoring__io-check">
                  <input
                    type="checkbox"
                    checked={descriptor.required}
                    disabled={!editable}
                    onChange={(event) => updateInput(descriptor.name, {
                      ...descriptor,
                      required: event.target.checked
                    })}
                  />
                  Required
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
                        : descriptor.required
                    })}
                  />
                  Nullable
                </label>
                <label>
                  Default JSON
                  <input
                    key={`${descriptor.name}:${jsonValue(descriptor.default)}`}
                    defaultValue={'default' in descriptor
                      ? jsonValue(descriptor.default)
                      : ''}
                    placeholder={descriptor.required
                      ? 'required input has no default'
                      : 'JSON value'}
                    disabled={!editable || descriptor.required}
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
                <DescriptorTextFields
                  descriptor={descriptor}
                  disabled={!editable}
                  onChange={(next) => updateInput(descriptor.name, next)}
                />
                <label>
                  Bind to target Handle
                  <select
                    aria-label="Action input 绑定"
                    value=""
                    disabled={!editable || options.inputTargets.length === 0}
                    onChange={(event) => {
                      if (!event.target.value) return
                      const target = options.inputTargets[
                        Number(event.target.value)
                      ]
                      if (!target) return
                      mutate(() => bindWorkflowInput(graph, {
                        parameter: descriptor.name,
                        ...target
                      }))
                    }}
                  >
                    <option value="">选择 Node target Handle…</option>
                    {options.inputTargets.map((target, index) => (
                      <option
                        key={`${target.workflowNodeUuid}:${target.targetHandleUuid}`}
                        value={index}
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
                <BindingList graph={graph} parameter={descriptor.name} />
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={!editable}
            onClick={() => mutate(() => addWorkflowInput(graph, {
              name: uniqueName(io.inputs.map(({ name }) => name), 'input'),
              schema: { type: 'string' },
              required: true
            }))}
          >
            Add Input
          </button>
        </ContractEditor>

        <ContractEditor title="Workflow Outputs">
          <ol>
            {io.outputs.map((descriptor) => {
              const readonly = descriptor.implicit || !editable
              const binding = io.outputBindings[descriptor.name]
              return (
                <li
                  key={descriptor.name}
                  data-workflow-output-name={descriptor.name}
                  aria-readonly={descriptor.implicit ? 'true' : undefined}
                >
                  <div className="persistent-authoring__io-editor-row-heading">
                    <code>{descriptor.name}</code>
                    {descriptor.implicit ? (
                      <span>implicit · OS-managed</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => mutate(() =>
                          removeWorkflowOutput(graph, descriptor.name)
                        )}
                      >
                        删除
                      </button>
                    )}
                  </div>
                  <label>
                    Name
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
                  <SchemaControl
                    label={`${descriptor.name} output type`}
                    schema={descriptor.schema}
                    disabled={readonly}
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
                    Nullable
                  </label>
                  <DescriptorTextFields
                    descriptor={descriptor}
                    disabled={readonly}
                    onChange={(next) => updateOutput(descriptor.name, next)}
                  />
                  <label>
                    Producer
                    <select
                      aria-label="Workflow output 绑定"
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
                      <option value="">选择唯一 producer…</option>
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
                            ? `Workflow input · ${source.parameter}`
                            : handleLabel(
                                graph,
                                source.workflowNodeUuid,
                                source.sourceHandleUuid
                              )}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              )
            })}
          </ol>
          <button
            type="button"
            disabled={!editable}
            onClick={() => mutate(() => addWorkflowOutput(graph, {
              name: uniqueName(io.outputs.map(({ name }) => name), 'output'),
              schema: { type: 'object' },
              implicit: false
            }))}
          >
            Add Output
          </button>
        </ContractEditor>
      </div>
    </section>
  )
}

function ContractEditor({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return <section><h3>{title}</h3>{children}</section>
}

function SchemaControl({
  label,
  schema,
  disabled,
  onChange
}: {
  label: string
  schema: WorkflowValueSchema
  disabled: boolean
  onChange: (schema: WorkflowValueSchema) => void
}): React.JSX.Element {
  const nullable = isNullable(schema)
  return (
    <label>
      Type
      <select
        aria-label={label}
        value={schemaMode(schema)}
        disabled={disabled}
        onChange={(event) => {
          const next = schemaForMode(event.target.value as SchemaMode)
          onChange(nullable ? nullableSchema(next) : next)
        }}
      >
        <option value="string">string</option>
        <option value="integer">integer</option>
        <option value="number">number</option>
        <option value="boolean">boolean</option>
        <option value="object">object (opaque JSON)</option>
        <option value="resource_slot">ResourceSlot</option>
        <option value="resource_slot_list">list[ResourceSlot]</option>
      </select>
    </label>
  )
}

function DescriptorTextFields<T extends {
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
        Title
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
        Description
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

function BindingList({
  graph,
  parameter
}: {
  graph: WorkflowAuthoringGraph
  parameter: string
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
    <small>
      Bound: {bindings.map(({ nodeUuid, handleUuid }) =>
        handleLabel(graph, nodeUuid, handleUuid)
      ).join(', ')}
    </small>
  )
}

function workflowIo(graph: WorkflowAuthoringGraph): {
  inputs: WorkflowInputDescriptor[]
  outputs: WorkflowOutputDescriptor[]
  outputBindings: Record<string, WorkflowOutputBinding>
} {
  const unilab = recordOrEmpty(graph.workflow.meta_data?.unilab)
  const inputContract = recordOrEmpty(unilab.input_contract)
  const outputContract = recordOrEmpty(unilab.output_contract)
  return {
    inputs: Array.isArray(inputContract.parameters)
      ? inputContract.parameters as WorkflowInputDescriptor[]
      : [],
    outputs: Array.isArray(outputContract.outputs)
      ? outputContract.outputs as WorkflowOutputDescriptor[]
      : [],
    outputBindings: recordOrEmpty(unilab.output_bindings) as Record<
      string,
      WorkflowOutputBinding
    >
  }
}

function normalizeInputDescriptor(
  descriptor: WorkflowInputDescriptor
): WorkflowInputDescriptor {
  if (descriptor.required) {
    const next = {
      ...descriptor,
      schema: nonNullSchema(descriptor.schema)
    }
    delete next.default
    return next
  }
  if (isNullable(descriptor.schema)) {
    return { ...descriptor, default: null }
  }
  if ('default' in descriptor) return descriptor
  return { ...descriptor, default: defaultValue(descriptor.schema) }
}

function withoutDefault(
  descriptor: WorkflowInputDescriptor
): WorkflowInputDescriptor {
  const next = { ...descriptor }
  delete next.default
  return next
}

function defaultValue(schema: WorkflowValueSchema): WorkflowJsonValue {
  const base = nonNullSchema(schema)
  if ('$slot' in base) return { uuid: '' }
  switch (base.type) {
    case 'string': return ''
    case 'integer':
    case 'number': return 0
    case 'boolean': return false
    case 'object': return {}
    case 'array': return []
  }
}

function schemaMode(schema: WorkflowValueSchema): SchemaMode {
  const base = nonNullSchema(schema)
  if ('$slot' in base) return 'resource_slot'
  if (base.type === 'array' && '$slot' in base.items) {
    return 'resource_slot_list'
  }
  return base.type as Exclude<SchemaMode, 'resource_slot' | 'resource_slot_list'>
}

function schemaForMode(mode: SchemaMode): WorkflowValueSchema {
  if (mode === 'resource_slot') return { $slot: 'ResourceSlot' }
  if (mode === 'resource_slot_list') {
    return { type: 'array', items: { $slot: 'ResourceSlot' } }
  }
  return { type: mode }
}

function nullableSchema(schema: WorkflowValueSchema): WorkflowValueSchema {
  if (isNullable(schema)) return schema
  return { anyOf: [nonNullSchema(schema), { type: 'null' }] }
}

function nonNullSchema(schema: WorkflowValueSchema): Exclude<
  WorkflowValueSchema,
  { anyOf: unknown }
> {
  return 'anyOf' in schema ? schema.anyOf[0] : schema
}

function isNullable(schema: WorkflowValueSchema): boolean {
  return 'anyOf' in schema
}

function bindingValue(binding: WorkflowOutputBinding | undefined): string {
  if (!binding) return ''
  return binding.kind === 'workflow_input'
    ? `input:${binding.parameter}`
    : `node:${binding.workflow_node_uuid}:${binding.source_handle_uuid}`
}

function sourceValue(
  source:
    | { kind: 'workflow_input'; parameter: string }
    | {
        kind: 'node_output'
        workflowNodeUuid: string
        sourceHandleUuid: string
      }
): string {
  return source.kind === 'workflow_input'
    ? `input:${source.parameter}`
    : `node:${source.workflowNodeUuid}:${source.sourceHandleUuid}`
}

function handleLabel(
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  handleUuid: string
): string {
  const node = graph.nodes.find(({ uuid }) => uuid === nodeUuid)
  const handle = graph.handle_templates.find(({ uuid }) => uuid === handleUuid)
  const nodeLabel = String(node?.name || nodeUuid)
  const handleLabel = String(
    handle?.display_name || handle?.handle_key || handleUuid
  )
  return `${nodeLabel} · ${handleLabel}`
}

function uniqueName(names: string[], prefix: string): string {
  let suffix = 1
  while (names.includes(`${prefix}_${suffix}`)) suffix += 1
  return `${prefix}_${suffix}`
}

function withOptionalText<T extends object>(
  value: T,
  key: 'title' | 'description',
  text: string
): T {
  const next = { ...value } as Record<string, unknown>
  if (text) next[key] = text
  else delete next[key]
  return next as T
}

function jsonValue(value: unknown): string {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? '' : encoded
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
