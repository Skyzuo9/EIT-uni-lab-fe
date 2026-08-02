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
  moveWorkflowInput,
  moveWorkflowOutput,
  projectWorkflowIoBindingOptions,
  removeWorkflowInput,
  removeWorkflowOutput,
  unbindWorkflowInput,
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
  | 'array'
  | 'resource_slot'

type NonNullableSchema = Exclude<
  WorkflowValueSchema,
  { anyOf: unknown }
>
type ArrayItemSchema = Exclude<
  NonNullableSchema,
  { type: 'array' }
>

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
            {io.inputs.map((descriptor, index) => (
              <li
                key={descriptor.name}
                data-workflow-input-name={descriptor.name}
              >
                <div className="persistent-authoring__io-editor-row-heading">
                  <code>{descriptor.name}</code>
                  <span>
                    <button
                      type="button"
                      disabled={!editable || index === 0}
                      onClick={() => mutate(() => moveWorkflowInput(
                        graph,
                        descriptor.name,
                        'up'
                      ))}
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      disabled={!editable || index === io.inputs.length - 1}
                      onClick={() => mutate(() => moveWorkflowInput(
                        graph,
                        descriptor.name,
                        'down'
                      ))}
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => mutate(() =>
                        removeWorkflowInput(graph, descriptor.name)
                      )}
                    >
                      删除
                    </button>
                  </span>
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
                  label={`${descriptor.name} input`}
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
                        : containsResourceSlot(descriptor.schema)
                          ? true
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
                    <option value="">选择 Node target Handle…</option>
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
            {io.outputs.map((descriptor, index) => {
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
                      <span>
                        <button
                          type="button"
                          disabled={!editable || index === 0}
                          onClick={() => mutate(() => moveWorkflowOutput(
                            graph,
                            descriptor.name,
                            'up'
                          ))}
                        >
                          上移
                        </button>
                        <button
                          type="button"
                          disabled={
                            !editable || index === io.outputs.length - 1
                          }
                          onClick={() => mutate(() => moveWorkflowOutput(
                            graph,
                            descriptor.name,
                            'down'
                          ))}
                        >
                          下移
                        </button>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => mutate(() =>
                            removeWorkflowOutput(graph, descriptor.name)
                          )}
                        >
                          删除
                        </button>
                      </span>
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
                    label={`${descriptor.name} output`}
                    schema={descriptor.schema}
                    disabled={readonly}
                    onProblem={setProblem}
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
  onProblem,
  onChange
}: {
  label: string
  schema: WorkflowValueSchema
  disabled: boolean
  onProblem: (message: string | null) => void
  onChange: (schema: WorkflowValueSchema) => void
}): React.JSX.Element {
  const nullable = isNullable(schema)
  const base = nonNullSchema(schema)
  const apply = (operation: () => NonNullableSchema): void => {
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
            label={`${label} items`}
            mode={schemaMode(base.items)}
            allowArray={false}
            disabled={disabled}
            onChange={(mode) => apply(() => ({
              ...base,
              items: schemaForItemMode(mode)
            }))}
          />
          <SchemaConstraintFields
            label={`${label} items`}
            schema={base.items as ArrayItemSchema}
            disabled={disabled}
            onChange={(items) => apply(() => ({ ...base, items }))}
            onProblem={onProblem}
          />
          <OptionalNumberField
            label="Min items"
            ariaLabel={`${label} min items`}
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
            label="Max items"
            ariaLabel={`${label} max items`}
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
          schema={base as ArrayItemSchema}
          disabled={disabled}
          onChange={(next) => apply(() => next)}
          onProblem={onProblem}
        />
      )}
    </>
  )
}

function SchemaTypeSelect({
  label,
  mode,
  allowArray,
  disabled,
  onChange
}: {
  label: string
  mode: SchemaMode
  allowArray: boolean
  disabled: boolean
  onChange: (mode: SchemaMode) => void
}): React.JSX.Element {
  return (
    <label>
      Type
      <select
        aria-label={`${label} type`}
        value={mode}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as SchemaMode)}
      >
        <option value="string">string</option>
        <option value="integer">integer</option>
        <option value="number">number</option>
        <option value="boolean">boolean</option>
        <option value="object">object (opaque JSON)</option>
        {allowArray && <option value="array">list</option>}
        <option value="resource_slot">ResourceSlot</option>
      </select>
    </label>
  )
}

function SchemaConstraintFields({
  label,
  schema,
  disabled,
  onChange,
  onProblem
}: {
  label: string
  schema: ArrayItemSchema
  disabled: boolean
  onChange: (schema: ArrayItemSchema) => void
  onProblem: (message: string | null) => void
}): React.JSX.Element | null {
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
        throw new Error(`${field} 必须是非空 JSON array`)
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
        Allowed ResourceTemplate UUIDs JSON
        <input
          aria-label={`${label} allowed resource template UUIDs`}
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
      Enum JSON
      <input
        aria-label={`${label} enum JSON`}
        defaultValue={jsonValue(schema.enum)}
        placeholder="[value, ...]"
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
          label="Minimum"
          ariaLabel={`${label} minimum`}
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
          label="Maximum"
          ariaLabel={`${label} maximum`}
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
  const stringSchema = schema as Extract<ArrayItemSchema, { type: 'string' }>
  return (
    <>
      {enumField}
      <OptionalNumberField
        label="Min length"
        ariaLabel={`${label} min length`}
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
        label="Max length"
        ariaLabel={`${label} max length`}
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
        Editor control
        <select
          aria-label={`${label} editor control`}
          value={stringSchema['x-unilabos-editor-control'] ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(withSchemaField(
            stringSchema,
            'x-unilabos-editor-control',
            event.target.value || undefined
          ))}
        >
          <option value="">default</option>
          <option value="site_selector">Site selector</option>
        </select>
      </label>
    </>
  )
}

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
    <div>
      <small>Bound:</small>
      {bindings.map(({ nodeUuid, handleUuid }) => (
        <span key={`${nodeUuid}:${handleUuid}`}>
          {handleLabel(graph, nodeUuid, handleUuid)}
          <button
            type="button"
            data-workflow-node-uuid={nodeUuid}
            data-workflow-handle-template-uuid={handleUuid}
            disabled={!editable}
            onClick={() => onUnbind(nodeUuid, handleUuid)}
          >
            解除绑定
          </button>
        </span>
      ))}
    </div>
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
  if (containsResourceSlot(descriptor.schema)) {
    throw new Error('optional ResourceSlot input 必须先设为 Nullable')
  }
  if ('default' in descriptor && descriptor.default !== null) return descriptor
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
  if (
    '$slot' in base ||
    (base.type === 'array' && containsResourceSlot(base.items))
  ) {
    throw new Error('ResourceSlot input 不允许浏览器生成 default')
  }
  switch (base.type) {
    case 'string': return ''
    case 'integer':
    case 'number': return 0
    case 'boolean': return false
    case 'object': return {}
    case 'array': return []
  }
  throw new Error('Workflow input schema 不支持浏览器 default')
}

function schemaMode(schema: WorkflowValueSchema): SchemaMode {
  const base = nonNullSchema(schema)
  if ('$slot' in base) return 'resource_slot'
  return base.type
}

function schemaForMode(mode: SchemaMode): NonNullableSchema {
  if (mode === 'resource_slot') return { $slot: 'ResourceSlot' }
  if (mode === 'array') return { type: 'array', items: { type: 'string' } }
  return { type: mode }
}

function schemaForItemMode(mode: SchemaMode): ArrayItemSchema {
  if (mode === 'array') throw new Error('Workflow v1 不支持 nested list schema')
  return schemaForMode(mode) as ArrayItemSchema
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

function isArraySchema(
  schema: NonNullableSchema
): schema is Extract<NonNullableSchema, { type: 'array' }> {
  return 'type' in schema && schema.type === 'array'
}

function containsResourceSlot(schema: WorkflowValueSchema): boolean {
  if ('anyOf' in schema) return containsResourceSlot(schema.anyOf[0])
  if ('$slot' in schema) return true
  return schema.type === 'array' && containsResourceSlot(schema.items)
}

function withSchemaField<T extends NonNullableSchema>(
  schema: T,
  field: string,
  value: unknown
): T {
  const next = { ...schema } as Record<string, unknown>
  if (value === undefined) delete next[field]
  else next[field] = value
  return next as T
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

function inputTargetValue(target: {
  workflowNodeUuid: string
  targetHandleUuid: string
}): string {
  return `node:${target.workflowNodeUuid}:${target.targetHandleUuid}`
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
