import type { LabMapPoint } from './types'

export type LabMapEquipmentCategory =
  | 'instrument'
  | 'automation'
  | 'workstation'

export interface LabMapEquipmentTemplate {
  id: string
  name: string
  code: string
  category: LabMapEquipmentCategory
  footprintMm: readonly [number, number]
  heightMm: number
  color: string
}

/**
 * Map-design object only. A draft equipment object is not a MaterialAggregate
 * and has no MaterialId until a future OS write command explicitly provisions
 * it.
 */
export interface LabMapDraftEquipment {
  id: string
  templateId: string
  name: string
  positionMm: LabMapPoint
  rotationDeg: number
}

export const LAB_MAP_EQUIPMENT_TEMPLATES:
readonly LabMapEquipmentTemplate[] = [
  {
    id: 'liquid-handler',
    name: '液体工作站',
    code: 'LH',
    category: 'automation',
    footprintMm: [1400, 900],
    heightMm: 920,
    color: '#38bdf8'
  },
  {
    id: 'robotic-arm',
    name: '机械臂工站',
    code: 'ARM',
    category: 'automation',
    footprintMm: [1100, 1100],
    heightMm: 1500,
    color: '#a78bfa'
  },
  {
    id: 'centrifuge',
    name: '离心机',
    code: 'CFG',
    category: 'instrument',
    footprintMm: [760, 760],
    heightMm: 860,
    color: '#22d3ee'
  },
  {
    id: 'incubator',
    name: '培养箱',
    code: 'INC',
    category: 'instrument',
    footprintMm: [900, 800],
    heightMm: 1800,
    color: '#fbbf24'
  },
  {
    id: 'plate-reader',
    name: '酶标仪',
    code: 'PR',
    category: 'instrument',
    footprintMm: [620, 480],
    heightMm: 420,
    color: '#34d399'
  },
  {
    id: 'workbench',
    name: '实验工作台',
    code: 'BENCH',
    category: 'workstation',
    footprintMm: [1800, 750],
    heightMm: 900,
    color: '#94a3b8'
  }
]

export function createLabMapDraftEquipment(input: {
  id: string
  templateId: string
  positionMm: LabMapPoint
}): LabMapDraftEquipment {
  const template = requireEquipmentTemplate(input.templateId)
  return {
    id: input.id,
    templateId: template.id,
    name: template.name,
    positionMm: snapLabMapPoint(input.positionMm),
    rotationDeg: 0
  }
}

export function moveLabMapDraftEquipment(
  equipment: readonly LabMapDraftEquipment[],
  equipmentId: string,
  positionMm: LabMapPoint
): LabMapDraftEquipment[] {
  const snapped = snapLabMapPoint(positionMm)
  return equipment.map((item) =>
    item.id === equipmentId
      ? { ...item, positionMm: snapped }
      : item
  )
}

export function rotateLabMapDraftEquipment(
  equipment: readonly LabMapDraftEquipment[],
  equipmentId: string
): LabMapDraftEquipment[] {
  return equipment.map((item) =>
    item.id === equipmentId
      ? {
          ...item,
          rotationDeg: (item.rotationDeg + 90) % 360
        }
      : item
  )
}

export function removeLabMapDraftEquipment(
  equipment: readonly LabMapDraftEquipment[],
  equipmentId: string
): LabMapDraftEquipment[] {
  return equipment.filter((item) => item.id !== equipmentId)
}

export function readLabMapDraftEquipment(
  value: unknown
): LabMapDraftEquipment[] {
  if (!Array.isArray(value)) return []
  const templateIds = new Set(
    LAB_MAP_EQUIPMENT_TEMPLATES.map((template) => template.id)
  )
  return value.flatMap((candidate) => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      return []
    }
    const item = candidate as Record<string, unknown>
    const position = item.positionMm
    if (
      typeof item.id !== 'string' ||
      typeof item.templateId !== 'string' ||
      !templateIds.has(item.templateId) ||
      typeof item.name !== 'string' ||
      !Array.isArray(position) ||
      position.length !== 2 ||
      !position.every(
        (coordinate) =>
          typeof coordinate === 'number' &&
          Number.isFinite(coordinate)
      ) ||
      typeof item.rotationDeg !== 'number' ||
      !Number.isFinite(item.rotationDeg)
    ) {
      return []
    }
    return [{
      id: item.id,
      templateId: item.templateId,
      name: item.name,
      positionMm: [
        position[0] as number,
        position[1] as number
      ],
      rotationDeg:
        ((item.rotationDeg % 360) + 360) % 360
    }]
  })
}

export function equipmentTemplate(
  templateId: string
): LabMapEquipmentTemplate | undefined {
  return LAB_MAP_EQUIPMENT_TEMPLATES.find(
    (template) => template.id === templateId
  )
}

export function snapLabMapPoint(
  point: LabMapPoint,
  gridMm = 100
): LabMapPoint {
  return [
    Math.round(point[0] / gridMm) * gridMm,
    Math.round(point[1] / gridMm) * gridMm
  ]
}

function requireEquipmentTemplate(
  templateId: string
): LabMapEquipmentTemplate {
  const template = equipmentTemplate(templateId)
  if (!template) {
    throw new Error(`Unknown Lab Map equipment template: ${templateId}`)
  }
  return template
}
