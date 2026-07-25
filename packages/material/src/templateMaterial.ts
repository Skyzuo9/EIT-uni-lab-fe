export interface MaterialTemplateWell {
  type?: string
  data?: {
    liquids?: readonly (readonly [string, number] | null)[]
    pendingLiquids?: readonly (readonly [string, number] | null)[]
    liquidHistory?: readonly string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface MaterialTemplateInput {
  uuid: string
  name: string
  configInfos?: readonly MaterialTemplateWell[]
}

export interface CreateMaterialNodeInput {
  displayName: string
  name: string
  resourceTemplateId: string
  plateWellData: Record<string, unknown>
}

export interface TemplateMaterialDraft {
  createInput: CreateMaterialNodeInput
  wells: readonly MaterialTemplateWell[]
  requiresLiquidConfiguration: boolean
}

const DEFAULT_LIQUID = [['Water', 500]] as const
const DEFAULT_LIQUID_HISTORY = ['Water'] as const

/**
 * Ports the behavior of Cloud's DeviceMaterialTemplate without its component,
 * modal, Redux, or transport dependencies.
 */
export function createMaterialDraftFromTemplate(
  template: MaterialTemplateInput,
  existingNames: readonly string[]
): TemplateMaterialDraft {
  const name = nextAvailableName(template.name, existingNames)
  const wells = template.configInfos ?? []
  const requiresLiquidConfiguration = wells.some(hasLiquidField)

  return {
    createInput: {
      displayName: name,
      name,
      resourceTemplateId: template.uuid,
      plateWellData: {}
    },
    wells: requiresLiquidConfiguration
      ? wells.map(withDefaultLiquid)
      : structuredClone(wells),
    requiresLiquidConfiguration
  }
}

function hasLiquidField(well: MaterialTemplateWell): boolean {
  const liquids = well.data?.liquids
  return Array.isArray(liquids) && liquids[0] != null
}

function withDefaultLiquid(well: MaterialTemplateWell): MaterialTemplateWell {
  if (well.type !== 'well') return structuredClone(well)
  return {
    ...structuredClone(well),
    data: {
      ...structuredClone(well.data ?? {}),
      liquids: DEFAULT_LIQUID,
      pendingLiquids: DEFAULT_LIQUID,
      liquidHistory: DEFAULT_LIQUID_HISTORY
    }
  }
}

function nextAvailableName(
  requestedName: string,
  existingNames: readonly string[]
): string {
  const occupied = new Set(existingNames)
  if (!occupied.has(requestedName)) return requestedName

  let suffix = 2
  while (occupied.has(`${requestedName} ${suffix}`)) suffix += 1
  return `${requestedName} ${suffix}`
}
