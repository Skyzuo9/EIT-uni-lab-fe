import type { MaterialGraphPort, MaterialScope } from '@unilab/material'

export interface WorkflowResourceSlotOption {
  materialUuid: string
  resourceTemplateUuid: string
  displayLabel: string
}

export interface WorkflowResourceSlotOptionsPort {
  list(): Promise<readonly WorkflowResourceSlotOption[]>
}

export type WorkflowResourceSlotOptionsState =
  | {
      kind: 'ready'
      options: readonly WorkflowResourceSlotOption[]
    }
  | {
      kind: 'unavailable' | 'error'
      options: []
      message: string
    }

/** Build a compact, human-readable label while retaining the stable identity. */
export function workflowResourceSlotOptionLabel(
  name: string,
  materialUuid: string
): string {
  return `${name} · …${materialUuid.replace(/-/g, '').slice(-6)}`
}

/**
 * Adapt the shared material graph into the narrow readonly option boundary used
 * by workflow authoring. Hosts only provide their active laboratory scope; the
 * inventory-to-ResourceSlot projection stays identical in web and desktop.
 */
export function createWorkflowResourceSlotOptionsPort(
  graph: MaterialGraphPort,
  scope: MaterialScope | null
): WorkflowResourceSlotOptionsPort {
  return {
    list: async () => {
      if (!scope) {
        throw new Error('请先选择实验室，再选择 Material ResourceSlot')
      }
      const aggregates = await graph.getGraph(scope)
      return aggregates.map(({ material }) => ({
        materialUuid: material.id,
        resourceTemplateUuid: material.sourceTemplateId,
        displayLabel: workflowResourceSlotOptionLabel(
          material.name,
          material.id
        )
      }))
    }
  }
}

export function filterWorkflowResourceSlotOptions(
  options: readonly WorkflowResourceSlotOption[],
  allowedResourceTemplateUuids?: readonly string[]
): readonly WorkflowResourceSlotOption[] {
  if (allowedResourceTemplateUuids === undefined) return options
  const allowed = new Set(allowedResourceTemplateUuids)
  return options.filter(({ resourceTemplateUuid }) =>
    allowed.has(resourceTemplateUuid)
  )
}

export async function loadWorkflowResourceSlotOptions(
  port?: WorkflowResourceSlotOptionsPort
): Promise<WorkflowResourceSlotOptionsState> {
  if (!port) {
    return {
      kind: 'unavailable',
      options: [],
      message: 'Material ResourceSlot 选项端口未注入，当前尚不可用'
    }
  }
  try {
    return { kind: 'ready', options: await port.list() }
  } catch (error) {
    return {
      kind: 'error',
      options: [],
      message: `Material ResourceSlot 选项读取失败，请重试：${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }
}
