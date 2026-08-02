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
