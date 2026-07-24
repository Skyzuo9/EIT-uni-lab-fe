/** [AI] Model: Claude Opus 4.8 | 2026-07-21 | 解析 liquid_handler.yaml 文本为物料配置 */
import { load } from 'js-yaml'
import type {
  DeckSlot,
  Labware,
  LabwareType,
  LiquidHandlerConfig,
  WellReagent
} from '../data/liquidHandler'

interface ParseResult {
  config: LiquidHandlerConfig | null
  error: string | null
}

const LABWARE_TYPES: LabwareType[] = ['tip_rack', 'plate', 'reservoir', 'tube_rack', 'trash']

// 将 YAML 文本解析为 LiquidHandlerConfig；失败时返回错误信息
export function parseLiquidHandlerYaml(text: string): ParseResult {
  try {
    const doc = load(text)
    if (!doc || typeof doc !== 'object') {
      return { config: null, error: 'YAML 内容为空或格式不正确' }
    }
    const record = doc as Record<string, unknown>
    const device = asRecord(record.device)
    const config: LiquidHandlerConfig = {
      device: {
        id: asString(device.id),
        name: asString(device.name) || '未命名设备',
        model: asString(device.model),
        channels: asNumber(device.channels),
        tipVolumeUl: asNumber(device.tip_volume_ul)
      },
      reagents: asArray(record.reagents).map((item) => {
        const reagent = asRecord(item)
        return { reagent: asString(reagent.name), color: asString(reagent.color) || '#adb5bd' }
      }),
      deck: asArray(record.deck).map(mapSlot)
    }
    return { config, error: null }
  } catch (error) {
    return { config: null, error: error instanceof Error ? error.message : 'YAML 解析失败' }
  }
}

// 解析单个 deck 槽位
function mapSlot(raw: unknown): DeckSlot {
  const record = asRecord(raw)
  const slot = asNumber(record.slot)
  const labwareRaw = record.labware
  if (!labwareRaw || typeof labwareRaw !== 'object') {
    return { slot }
  }
  const labware = asRecord(labwareRaw)
  const [rows, cols] = parseLayout(asString(labware.layout))
  const parsed: Labware = {
    type: normalizeType(asString(labware.type)),
    name: asString(labware.name),
    displayName: asString(labware.display_name) || asString(labware.name),
    rows,
    cols,
    tipVolumeUl: labware.tip_volume_ul != null ? asNumber(labware.tip_volume_ul) : undefined,
    wells: labware.wells ? mapWells(labware.wells) : undefined
  }
  return { slot, labware: parsed }
}

// 解析孔位分布：{ A1: { reagent, volume_ul } }
function mapWells(raw: unknown): Record<string, WellReagent> {
  const record = asRecord(raw)
  return Object.entries(record).reduce(
    (acc, [position, value]) => {
      const well = asRecord(value)
      acc[position] = { reagent: asString(well.reagent), volumeUl: asNumber(well.volume_ul) }
      return acc
    },
    {} as Record<string, WellReagent>
  )
}

// "8x12" -> [8, 12]，缺省为 [1, 1]
function parseLayout(layout: string): [number, number] {
  const match = layout.match(/^(\d+)\s*[xX]\s*(\d+)$/)
  if (!match) return [1, 1]
  return [Number(match[1]), Number(match[2])]
}

function normalizeType(type: string): LabwareType {
  return LABWARE_TYPES.includes(type as LabwareType) ? (type as LabwareType) : 'plate'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string {
  return value == null ? '' : String(value)
}

function asNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}
