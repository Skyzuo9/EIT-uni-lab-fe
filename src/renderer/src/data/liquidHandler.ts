/** [AI] Model: Claude Opus 4.8 | 2026-07-21 | 液体工作站配置数据与 YAML 序列化 */

// 物料（耗材）类型
export type LabwareType = 'tip_rack' | 'plate' | 'reservoir' | 'tube_rack' | 'trash'

// 孔位内的试剂信息
export interface WellReagent {
  reagent: string
  volumeUl: number
}

// 单个物料（放置在 deck 槽位上的耗材）
export interface Labware {
  type: LabwareType
  name: string
  displayName: string
  rows: number
  cols: number
  tipVolumeUl?: number
  // 以孔位坐标（如 A1）为 key 的试剂分布
  wells?: Record<string, WellReagent>
}

// deck 上的一个槽位
export interface DeckSlot {
  slot: number
  labware?: Labware
}

// 试剂调色板（reagent -> 颜色），供物料界面与 YAML 图例共用
export interface ReagentDef {
  reagent: string
  color: string
}

export interface LiquidHandlerConfig {
  device: {
    id: string
    name: string
    model: string
    channels: number
    tipVolumeUl: number
  }
  reagents: ReagentDef[]
  deck: DeckSlot[]
}

// 试剂 -> 颜色映射
export const reagentPalette: ReagentDef[] = [
  { reagent: '缓冲液 A', color: '#4dabf7' },
  { reagent: '缓冲液 B', color: '#38d9a9' },
  { reagent: '样品', color: '#f783ac' },
  { reagent: '洗脱液', color: '#ffa94d' },
  { reagent: '纯水', color: '#74c0fc' }
]

// 生成一批孔位（按列铺满 count 个孔），用于示例数据
function buildWells(count: number, reagent: string, volumeUl: number): Record<string, WellReagent> {
  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  const wells: Record<string, WellReagent> = {}
  let filled = 0
  for (let col = 1; col <= 12 && filled < count; col += 1) {
    for (let row = 0; row < rowLabels.length && filled < count; row += 1) {
      wells[`${rowLabels[row]}${col}`] = { reagent, volumeUl }
      filled += 1
    }
  }
  return wells
}

export const liquidHandlerConfig: LiquidHandlerConfig = {
  device: {
    id: 'lh_ot2_01',
    name: 'OT-2 液体工作站',
    model: 'Opentrons OT-2',
    channels: 8,
    tipVolumeUl: 300
  },
  reagents: reagentPalette,
  deck: [
    {
      slot: 1,
      labware: {
        type: 'tip_rack',
        name: 'opentrons_96_tiprack_300ul',
        displayName: '枪头架 300µL',
        rows: 8,
        cols: 12,
        tipVolumeUl: 300
      }
    },
    {
      slot: 2,
      labware: {
        type: 'reservoir',
        name: 'nest_12_reservoir_15ml',
        displayName: '试剂槽 12 通道',
        rows: 1,
        cols: 12,
        wells: {
          A1: { reagent: '缓冲液 A', volumeUl: 12000 },
          A2: { reagent: '缓冲液 B', volumeUl: 12000 },
          A3: { reagent: '洗脱液', volumeUl: 8000 },
          A4: { reagent: '纯水', volumeUl: 15000 }
        }
      }
    },
    {
      slot: 3,
      labware: {
        type: 'plate',
        name: 'corning_96_wellplate_360ul',
        displayName: '样品板 96 孔',
        rows: 8,
        cols: 12,
        wells: buildWells(24, '样品', 180)
      }
    },
    {
      slot: 4,
      labware: {
        type: 'plate',
        name: 'corning_96_wellplate_360ul',
        displayName: '反应板 96 孔',
        rows: 8,
        cols: 12,
        wells: buildWells(48, '缓冲液 A', 100)
      }
    },
    { slot: 5 },
    {
      slot: 6,
      labware: {
        type: 'tube_rack',
        name: 'opentrons_24_tuberack_2ml',
        displayName: '离心管架 24 位',
        rows: 4,
        cols: 6,
        wells: buildWells(6, '洗脱液', 1500)
      }
    },
    { slot: 7 },
    { slot: 8 },
    {
      slot: 9,
      labware: {
        type: 'tip_rack',
        name: 'opentrons_96_tiprack_300ul',
        displayName: '枪头架 300µL',
        rows: 8,
        cols: 12,
        tipVolumeUl: 300
      }
    },
    { slot: 10 },
    { slot: 11 },
    {
      slot: 12,
      labware: {
        type: 'trash',
        name: 'opentrons_1_trash',
        displayName: '废液槽',
        rows: 1,
        cols: 1
      }
    }
  ]
}

// 将任意可序列化对象转换为 YAML 文本（仅覆盖本项目需要的标量/对象/数组结构）
function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const body = toYaml(item, indent + 1).replace(/^\s+/, '')
          return `${pad}- ${body}`
        }
        return `${pad}- ${formatScalar(item)}\n`
      })
      .join('')
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return entries
      .map(([key, val]) => {
        if (val !== null && typeof val === 'object') {
          if (Array.isArray(val) && val.length === 0) return `${pad}${key}: []\n`
          if (!Array.isArray(val) && Object.keys(val as object).length === 0) {
            return `${pad}${key}: {}\n`
          }
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`
        }
        return `${pad}${key}: ${formatScalar(val)}\n`
      })
      .join('')
  }

  return `${pad}${formatScalar(value)}\n`
}

// 标量格式化：数字/布尔原样输出，字符串按需加引号
function formatScalar(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const str = String(value)
  // 含特殊 YAML 字符或前后空格时加引号
  if (str === '' || /[:#{}\[\],&*?|<>=!%@`"']/.test(str) || /^\s|\s$/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`
  }
  return str
}

// 将 deck 配置转成 registry 风格的 YAML 结构，再序列化为文本
function buildYamlModel(config: LiquidHandlerConfig): Record<string, unknown> {
  return {
    device: {
      id: config.device.id,
      name: config.device.name,
      model: config.device.model,
      channels: config.device.channels,
      tip_volume_ul: config.device.tipVolumeUl
    },
    reagents: config.reagents.map((item) => ({
      name: item.reagent,
      color: item.color
    })),
    deck: config.deck.map((slot) => {
      if (!slot.labware) {
        return { slot: slot.slot, labware: null }
      }
      const labware = slot.labware
      const model: Record<string, unknown> = {
        type: labware.type,
        name: labware.name,
        display_name: labware.displayName,
        layout: `${labware.rows}x${labware.cols}`
      }
      if (labware.tipVolumeUl) model.tip_volume_ul = labware.tipVolumeUl
      if (labware.wells) {
        model.wells = Object.entries(labware.wells).reduce(
          (acc, [pos, well]) => {
            acc[pos] = { reagent: well.reagent, volume_ul: well.volumeUl }
            return acc
          },
          {} as Record<string, unknown>
        )
      }
      return { slot: slot.slot, labware: model }
    })
  }
}

// 左侧面板展示的 liquid_handler.yaml 文本
export const liquidHandlerYaml =
  '# 液体工作站设备配置 - liquid_handler.yaml\n' +
  `# 生成设备: ${liquidHandlerConfig.device.model}\n\n` +
  toYaml(buildYamlModel(liquidHandlerConfig))
