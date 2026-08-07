import type {
  WorkflowAuthoringGraph,
  WorkflowInputDescriptor,
  WorkflowOutputBinding,
  WorkflowOutputDescriptor,
  WorkflowValueSchema
} from '@unilab/services'


export interface MutableIo {
  inputContract: { version: 1; parameters: WorkflowInputDescriptor[] }
  outputContract: { version: 1; outputs: WorkflowOutputDescriptor[] }
  outputBindings: Record<string, WorkflowOutputBinding>
}

export function mutableIo(graph: WorkflowAuthoringGraph): MutableIo {
  const metaData = recordOrEmpty(graph.workflow.meta_data)
  const unilab = recordOrEmpty(metaData.unilab)
  const inputContract = recordOrEmpty(unilab.input_contract)
  const outputContract = recordOrEmpty(unilab.output_contract)
  const outputBindings = recordOrEmpty(unilab.output_bindings)
  const parameters = Array.isArray(inputContract.parameters)
    ? inputContract.parameters as WorkflowInputDescriptor[]
    : []
  const outputs = Array.isArray(outputContract.outputs)
    ? outputContract.outputs as WorkflowOutputDescriptor[]
    : []
  const io: MutableIo = {
    inputContract: { version: 1, parameters },
    outputContract: { version: 1, outputs },
    outputBindings: outputBindings as Record<string, WorkflowOutputBinding>
  }
  graph.workflow.meta_data = {
    ...metaData,
    unilab: {
      ...unilab,
      input_contract: io.inputContract,
      output_contract: io.outputContract,
      output_bindings: io.outputBindings
    }
  }
  return io
}

export function synchronizeImplicitOutputs(io: MutableIo): void {
  const slotInputs = new Map(
    io.inputContract.parameters
      .filter(({ schema }) => containsResourceSlot(schema))
      .map((descriptor) => [descriptor.name, descriptor])
  )
  io.outputContract.outputs = io.outputContract.outputs.filter(
    ({ name, implicit }) => !implicit || slotInputs.has(name)
  )
  for (const [name, descriptor] of slotInputs) {
    const existing = io.outputContract.outputs.find(
      (output) => output.name === name
    )
    // D-068 keeps historical explicit same-name outputs compatible. The OS
    // checks their schema assignability; FE only synthesizes the server-managed
    // pass-through when no explicit producer already owns that output name.
    if (existing && !existing.implicit) continue
    const implicit: WorkflowOutputDescriptor = {
      name,
      schema: structuredClone(descriptor.schema),
      implicit: true
    }
    if (existing) {
      io.outputContract.outputs[
        io.outputContract.outputs.indexOf(existing)
      ] = implicit
    } else {
      io.outputContract.outputs.push(implicit)
    }
    io.outputBindings[name] = {
      kind: 'workflow_input',
      parameter: name
    }
  }
  const outputNames = new Set(io.outputContract.outputs.map(({ name }) => name))
  for (const name of Object.keys(io.outputBindings)) {
    if (!outputNames.has(name)) delete io.outputBindings[name]
  }
}

export function containsResourceSlot(schema: WorkflowValueSchema): boolean {
  if ('$slot' in schema) return true
  if ('anyOf' in schema) return containsResourceSlot(schema.anyOf[0])
  return schema.type === 'array' && containsResourceSlot(schema.items)
}

export function requireInputDescriptorContract(
  descriptor: WorkflowInputDescriptor
): void {
  const nullable = 'anyOf' in descriptor.schema
  const hasDefault = Object.hasOwn(descriptor, 'default')
  if (descriptor.required) {
    if (nullable || hasDefault) {
      throw new Error('必填的工作流入参不能允许为空，也不能设置默认值')
    }
    return
  }
  if (containsResourceSlot(descriptor.schema) && !nullable) {
    throw new Error('选填的资源位工作流入参必须允许为空')
  }
  if (!hasDefault) {
    throw new Error('选填的工作流入参必须声明默认值')
  }
  if (nullable && descriptor.default !== null) {
    throw new Error('允许为空的工作流入参，其默认值必须是 null')
  }
}

export function moveNamedDescriptor<T extends { name: string }>(
  descriptors: T[],
  name: string,
  direction: 'up' | 'down',
  label: string
): void {
  const index = requireNamedIndex(name, descriptors, label)
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= descriptors.length) return
  const current = descriptors[index]
  const replacement = descriptors[target]
  if (!current || !replacement) return
  descriptors[index] = replacement
  descriptors[target] = current
}

export function renameInputBindings(
  graph: WorkflowAuthoringGraph,
  currentName: string,
  nextName: string
): void {
  for (const node of graph.nodes) {
    const metaData = recordOrEmpty(node.meta_data)
    const unilab = recordOrEmpty(metaData.unilab)
    const inputBindings = recordOrEmpty(unilab.input_bindings)
    for (const value of Object.values(inputBindings)) {
      const binding = recordOrEmpty(value)
      if (binding.parameter === currentName) binding.parameter = nextName
    }
  }
}

export function removeInputBindings(
  graph: WorkflowAuthoringGraph,
  name: string
): void {
  for (const node of graph.nodes) {
    const metaData = recordOrEmpty(node.meta_data)
    const unilab = recordOrEmpty(metaData.unilab)
    const inputBindings = recordOrEmpty(unilab.input_bindings)
    for (const [handleUuid, value] of Object.entries(inputBindings)) {
      if (recordOrEmpty(value).parameter === name) delete inputBindings[handleUuid]
    }
  }
}

export function requireOwnedHandle(
  graph: WorkflowAuthoringGraph,
  nodeUuid: string,
  handleUuid: string,
  ioType: 'source' | 'target'
): void {
  const node = graph.nodes.find(({ uuid }) => uuid === nodeUuid)
  if (!node) throw new Error('工作流节点不存在')
  const handle = graph.handle_templates.find(({ uuid }) => uuid === handleUuid)
  if (
    !handle ||
    handle.io_type !== ioType ||
    handle.workflow_node_template_uuid !== node.workflow_node_template_uuid
  ) {
    throw new Error(
      `Workflow ${ioType} Handle 不存在或不属于所选节点 owner`
    )
  }
}

export function requireNamedIndex(
  name: string,
  values: Array<{ name: string }>,
  label: string
): number {
  const index = values.findIndex((item) => item.name === name)
  if (index < 0) throw new Error(`${label} 不存在`)
  return index
}

export function requireNewName(
  name: string,
  names: string[],
  label: string
): void {
  requireName(name, label)
  if (names.includes(name)) throw new Error(`${label} 名称重复`)
}

export function requireAvailableName(
  name: string,
  currentName: string,
  names: string[],
  label: string
): void {
  requireName(name, label)
  if (name !== currentName && names.includes(name)) {
    throw new Error(`${label} 名称重复`)
  }
}

export function requireName(name: string, label: string): void {
  if (!name.trim()) throw new Error(`${label} 名称不能为空`)
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} 缺失`)
  return value
}

export function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function cloneGraph(graph: WorkflowAuthoringGraph): WorkflowAuthoringGraph {
  return structuredClone(graph)
}
