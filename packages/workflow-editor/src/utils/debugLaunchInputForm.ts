import type {
  DebugLaunchOverride,
  DebugLaunchRequirement,
  DebugWorkflowTaskPreflight
} from '@unilab/services'

export interface DebugLaunchInputFieldState {
  requirement: DebugLaunchRequirement
  valueText: string
  confirmed: boolean
}

export interface DebugLaunchInputFormState {
  preflight: DebugWorkflowTaskPreflight
  fields: DebugLaunchInputFieldState[]
}

export function createDebugLaunchInputForm(
  preflight: DebugWorkflowTaskPreflight
): DebugLaunchInputFormState {
  return {
    preflight: structuredClone(preflight),
    fields: preflight.requirements.map((requirement) => ({
      requirement: structuredClone(requirement),
      valueText: requirement.kind === 'material'
        ? requirement.suggestions.find(({ recommended }) => recommended)
          ?.material_uuid ?? ''
        : '',
      confirmed: false
    }))
  }
}

export function setDebugLaunchField(
  form: DebugLaunchInputFormState,
  requirementId: string,
  next: Pick<DebugLaunchInputFieldState, 'valueText' | 'confirmed'>
): DebugLaunchInputFormState {
  if (!form.fields.some(({ requirement }) => requirement.id === requirementId)) {
    throw new Error(`调试启动要求不存在：${requirementId}`)
  }
  return {
    ...form,
    fields: form.fields.map((field) =>
      field.requirement.id === requirementId
        ? { ...field, ...next }
        : field
    )
  }
}

export function buildDebugLaunchOverrides(
  form: DebugLaunchInputFormState
): DebugLaunchOverride[] {
  const accepted: DebugLaunchOverride[] = form.preflight.launch_overrides.map(
    ({ requirement_id: requirementId, value, confirmed }) => ({
      requirement_id: requirementId,
      value: structuredClone(value),
      ...(confirmed ? { confirmed: true } : {})
    })
  )
  const submitted = form.fields.map(({ requirement, valueText, confirmed }) => {
    const label = `${requirement.target.node_name} / ${requirement.target.display_name}`
    if (requirement.kind === 'material') {
      if (!valueText) throw new Error(`${label} 请选择当前实验室中的兼容物料`)
      if (!confirmed) throw new Error(`${label}：请确认物料的实际库位与状态`)
      return {
        requirement_id: requirement.id,
        value: { uuid: valueText },
        confirmed: true
      }
    }
    if (!valueText.trim()) throw new Error(`${label} 尚未填写`)
    try {
      return {
        requirement_id: requirement.id,
        value: JSON.parse(valueText) as unknown
      }
    } catch {
      throw new Error(`${label} 不是有效 JSON`)
    }
  })
  const submittedIds = new Set(submitted.map(({ requirement_id: id }) => id))
  return [
    ...accepted.filter(({ requirement_id: id }) => !submittedIds.has(id)),
    ...submitted
  ]
}
