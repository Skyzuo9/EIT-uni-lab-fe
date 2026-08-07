import type {
  WorkflowAuthoringGraph,
  WorkflowInputDescriptor,
  WorkflowOutputBinding,
  WorkflowOutputDescriptor,
  WorkflowValueSchema
} from '@unilab/services'

import {
  cloneGraph,
  containsResourceSlot,
  moveNamedDescriptor,
  mutableIo,
  recordOrEmpty,
  removeInputBindings,
  renameInputBindings,
  requireAvailableName,
  requireInputDescriptorContract,
  requireName,
  requireNamedIndex,
  requireNewName,
  requireOwnedHandle,
  requiredString,
  synchronizeImplicitOutputs
} from './workflowIoAuthoringModel'

export interface WorkflowInputTargetBinding {
  parameter: string
  workflowNodeUuid: string
  targetHandleUuid: string
}

export interface WorkflowIoBindingOptions {
  inputTargets: Array<{
    workflowNodeUuid: string
    targetHandleUuid: string
  }>
  outputSources: Array<
    | { kind: 'workflow_input'; parameter: string }
    | {
        kind: 'node_output'
        workflowNodeUuid: string
        sourceHandleUuid: string
      }
  >
}

export function addWorkflowInput(
  graph: WorkflowAuthoringGraph,
  descriptor: WorkflowInputDescriptor
): WorkflowAuthoringGraph {
  requireInputDescriptorContract(descriptor)
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  requireNewName(
    descriptor.name,
    io.inputContract.parameters.map(({ name }) => name),
    'Workflow input'
  )
  io.inputContract.parameters.push(structuredClone(descriptor))
  synchronizeImplicitOutputs(io)
  return next
}

export function updateWorkflowInput(
  graph: WorkflowAuthoringGraph,
  currentName: string,
  descriptor: WorkflowInputDescriptor
): WorkflowAuthoringGraph {
  requireInputDescriptorContract(descriptor)
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  const index = requireNamedIndex(
    currentName,
    io.inputContract.parameters,
    'Workflow input'
  )
  requireAvailableName(
    descriptor.name,
    currentName,
    io.inputContract.parameters.map(({ name }) => name),
    'Workflow input'
  )
  if (
    descriptor.name !== currentName &&
    io.outputContract.outputs.some(({ name, implicit }) =>
      name === descriptor.name && !implicit
    )
  ) {
    throw new Error('工作流入参名称与显式出参冲突')
  }
  io.inputContract.parameters[index] = structuredClone(descriptor)
  if (descriptor.name !== currentName) {
    renameInputBindings(next, currentName, descriptor.name)
    for (const binding of Object.values(io.outputBindings)) {
      if (
        binding.kind === 'workflow_input' &&
        binding.parameter === currentName
      ) binding.parameter = descriptor.name
    }
    const oldImplicit = io.outputContract.outputs.find(
      ({ name, implicit }) => name === currentName && implicit
    )
    if (oldImplicit) {
      oldImplicit.name = descriptor.name
      io.outputBindings[descriptor.name] =
        io.outputBindings[currentName] ?? {
          kind: 'workflow_input',
          parameter: descriptor.name
        }
      delete io.outputBindings[currentName]
    }
  }
  synchronizeImplicitOutputs(io)
  return next
}

export function removeWorkflowInput(
  graph: WorkflowAuthoringGraph,
  name: string
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  const index = requireNamedIndex(
    name,
    io.inputContract.parameters,
    'Workflow input'
  )
  io.inputContract.parameters.splice(index, 1)
  removeInputBindings(next, name)
  for (const [outputName, binding] of Object.entries(io.outputBindings)) {
    if (
      binding.kind === 'workflow_input' &&
      binding.parameter === name
    ) delete io.outputBindings[outputName]
  }
  io.outputContract.outputs = io.outputContract.outputs.filter(
    (output) => !(output.name === name && output.implicit)
  )
  synchronizeImplicitOutputs(io)
  return next
}

export function moveWorkflowInput(
  graph: WorkflowAuthoringGraph,
  name: string,
  direction: 'up' | 'down'
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  const parameters = mutableIo(next).inputContract.parameters
  moveNamedDescriptor(parameters, name, direction, 'Workflow input')
  return next
}

export function bindWorkflowInput(
  graph: WorkflowAuthoringGraph,
  binding: WorkflowInputTargetBinding
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  if (!io.inputContract.parameters.some(
    ({ name }) => name === binding.parameter
  )) throw new Error('工作流入参不存在')
  requireOwnedHandle(
    next,
    binding.workflowNodeUuid,
    binding.targetHandleUuid,
    'target'
  )
  next.nodes = next.nodes.map((node) => {
    if (node.uuid !== binding.workflowNodeUuid) return node
    const metaData = recordOrEmpty(node.meta_data)
    const unilab = recordOrEmpty(metaData.unilab)
    return {
      ...node,
      meta_data: {
        ...metaData,
        unilab: {
          ...unilab,
          input_bindings: {
            ...recordOrEmpty(unilab.input_bindings),
            [binding.targetHandleUuid]: { parameter: binding.parameter }
          }
        }
      }
    }
  })
  return next
}

export function unbindWorkflowInput(
  graph: WorkflowAuthoringGraph,
  workflowNodeUuid: string,
  targetHandleUuid: string
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  requireOwnedHandle(next, workflowNodeUuid, targetHandleUuid, 'target')
  next.nodes = next.nodes.map((node) => {
    if (node.uuid !== workflowNodeUuid) return node
    const metaData = recordOrEmpty(node.meta_data)
    const unilab = recordOrEmpty(metaData.unilab)
    const inputBindings = { ...recordOrEmpty(unilab.input_bindings) }
    delete inputBindings[targetHandleUuid]
    return {
      ...node,
      meta_data: {
        ...metaData,
        unilab: { ...unilab, input_bindings: inputBindings }
      }
    }
  })
  return next
}

export function addWorkflowOutput(
  graph: WorkflowAuthoringGraph,
  descriptor: WorkflowOutputDescriptor
): WorkflowAuthoringGraph {
  if (descriptor.implicit) {
    throw new Error('系统生成的工作流出参由服务器管理，不可新增')
  }
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  requireNewName(
    descriptor.name,
    io.outputContract.outputs.map(({ name }) => name),
    'Workflow output'
  )
  io.outputContract.outputs.push({
    ...structuredClone(descriptor),
    implicit: false
  })
  return next
}

export function updateWorkflowOutput(
  graph: WorkflowAuthoringGraph,
  currentName: string,
  descriptor: WorkflowOutputDescriptor
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  const index = requireNamedIndex(
    currentName,
    io.outputContract.outputs,
    'Workflow output'
  )
  if (io.outputContract.outputs[index]?.implicit || descriptor.implicit) {
    throw new Error('系统生成的工作流出参不可修改')
  }
  requireAvailableName(
    descriptor.name,
    currentName,
    io.outputContract.outputs.map(({ name }) => name),
    'Workflow output'
  )
  io.outputContract.outputs[index] = {
    ...structuredClone(descriptor),
    implicit: false
  }
  if (descriptor.name !== currentName) {
    const binding = io.outputBindings[currentName]
    if (binding) io.outputBindings[descriptor.name] = binding
    delete io.outputBindings[currentName]
  }
  return next
}

export function removeWorkflowOutput(
  graph: WorkflowAuthoringGraph,
  name: string
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  const index = requireNamedIndex(
    name,
    io.outputContract.outputs,
    'Workflow output'
  )
  if (io.outputContract.outputs[index]?.implicit) {
    throw new Error('系统生成的工作流出参不可删除')
  }
  io.outputContract.outputs.splice(index, 1)
  delete io.outputBindings[name]
  return next
}

export function moveWorkflowOutput(
  graph: WorkflowAuthoringGraph,
  name: string,
  direction: 'up' | 'down'
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  const outputs = mutableIo(next).outputContract.outputs
  const output = outputs.find((item) => item.name === name)
  if (output?.implicit) {
    throw new Error('系统生成的工作流出参顺序由服务器管理')
  }
  moveNamedDescriptor(outputs, name, direction, 'Workflow output')
  return next
}

export function bindWorkflowOutput(
  graph: WorkflowAuthoringGraph,
  name: string,
  binding: WorkflowOutputBinding
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  const output = io.outputContract.outputs.find((item) => item.name === name)
  if (!output) throw new Error('工作流出参不存在')
  if (output.implicit) {
    throw new Error('系统生成的工作流出参绑定不可修改')
  }
  if (binding.kind === 'workflow_input') {
    if (!io.inputContract.parameters.some(
      ({ name }) => name === binding.parameter
    )) throw new Error('工作流入参不存在')
  } else {
    requireOwnedHandle(
      next,
      binding.workflow_node_uuid,
      binding.source_handle_uuid,
      'source'
    )
  }
  io.outputBindings[name] = structuredClone(binding)
  return next
}

export function unbindWorkflowOutput(
  graph: WorkflowAuthoringGraph,
  name: string
): WorkflowAuthoringGraph {
  const next = cloneGraph(graph)
  const io = mutableIo(next)
  const output = io.outputContract.outputs.find((item) => item.name === name)
  if (!output) throw new Error('工作流出参不存在')
  if (output.implicit) {
    throw new Error('系统生成的工作流出参绑定不可解除')
  }
  delete io.outputBindings[name]
  return next
}

export function projectWorkflowIoBindingOptions(
  graph: WorkflowAuthoringGraph
): WorkflowIoBindingOptions {
  const io = mutableIo(cloneGraph(graph))
  const inputTargets: WorkflowIoBindingOptions['inputTargets'] = []
  const outputSources: WorkflowIoBindingOptions['outputSources'] =
    io.inputContract.parameters.map(({ name }) => ({
      kind: 'workflow_input',
      parameter: name
    }))
  for (const node of graph.nodes) {
    const nodeUuid = requiredString(node.uuid, 'Workflow Node UUID')
    const templateUuid = requiredString(
      node.workflow_node_template_uuid,
      'Workflow Node template UUID'
    )
    for (const handle of graph.handle_templates) {
      if (handle.workflow_node_template_uuid !== templateUuid) continue
      const handleUuid = requiredString(handle.uuid, 'Workflow Handle UUID')
      if (handle.io_type === 'target') {
        inputTargets.push({
          workflowNodeUuid: nodeUuid,
          targetHandleUuid: handleUuid
        })
      } else if (handle.io_type === 'source') {
        outputSources.push({
          kind: 'node_output',
          workflowNodeUuid: nodeUuid,
          sourceHandleUuid: handleUuid
        })
      }
    }
  }
  return { inputTargets, outputSources }
}
