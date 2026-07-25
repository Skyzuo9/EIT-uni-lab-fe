/** [AI] Model: Claude Opus 4.8 | 2026-07-21 | 右侧物料界面（deck 布局 + 试剂图例，随 YAML 实时刷新） */
import { useMemo, useState } from 'react'
import DeckSlotCard from './DeckSlotCard'
import { type DeckSlot, type LiquidHandlerConfig } from './liquidHandler'

interface MaterialPanelProps {
  config: LiquidHandlerConfig
  error?: string | null
}

// 右侧物料界面：展示液体工作站 deck 上的耗材布局与试剂图例，由解析后的 config 驱动
export default function MaterialPanel({ config, error }: MaterialPanelProps): React.JSX.Element {
  // 纯 UI 局部状态：当前选中的槽位（用于高亮与详情），无需抽离 Hook
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)

  const deckRows = useMemo(() => buildDeckRows(config.deck), [config.deck])
  const reagentUsage = useMemo(() => computeReagentUsage(config), [config])
  const colorMap = useMemo(() => buildColorMap(config), [config])
  const selected = config.deck.find((item) => item.slot === selectedSlot) ?? null

  return (
    <section className="panel panel--material">
      <header className="panel__header">
        <span className="panel__dot panel__dot--material" />
        <span className="panel__title">物料布局</span>
        <span className="panel__badge panel__badge--device">{config.device.name}</span>
        <span className="panel__meta">
          {config.device.channels} 通道 · 枪头 {config.device.tipVolumeUl}µL
        </span>
      </header>

      {error ? <div className="material__error">YAML 解析错误，展示上一次有效布局：{error}</div> : null}

      <div className="material">
        <div className="deck">
          {deckRows.map((row, rowIndex) => (
            <div className="deck__row" key={rowIndex}>
              {row.map((slot) => (
                <DeckSlotCard
                  key={slot.slot}
                  slot={slot}
                  colorMap={colorMap}
                  selected={slot.slot === selectedSlot}
                  onSelect={setSelectedSlot}
                />
              ))}
            </div>
          ))}
        </div>

        <aside className="material__side">
          <div className="material__block">
            <h4 className="material__block-title">试剂图例</h4>
            {config.reagents.length > 0 ? (
              <ul className="legend">
                {config.reagents.map((item) => (
                  <li className="legend__item" key={item.reagent}>
                    <span className="legend__swatch" style={{ backgroundColor: item.color }} />
                    <span className="legend__name">{item.reagent}</span>
                    <span className="legend__value">{reagentUsage[item.reagent] ?? 0}µL</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="material__hint">YAML 中未定义 reagents</p>
            )}
          </div>

          <div className="material__block">
            <h4 className="material__block-title">槽位详情</h4>
            {selected ? (
              <SlotDetail slot={selected} />
            ) : (
              <p className="material__hint">点击左侧任意槽位查看物料详情</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

interface SlotDetailProps {
  slot: DeckSlot
}

// 选中槽位的详情展示
function SlotDetail({ slot }: SlotDetailProps): React.JSX.Element {
  if (!slot.labware) {
    return <p className="material__hint">槽位 {slot.slot}：空位，可放置耗材</p>
  }
  const { labware } = slot
  const wellCount = labware.wells ? Object.keys(labware.wells).length : 0
  return (
    <dl className="detail">
      <div className="detail__row">
        <dt>槽位</dt>
        <dd>{slot.slot}</dd>
      </div>
      <div className="detail__row">
        <dt>名称</dt>
        <dd>{labware.displayName}</dd>
      </div>
      <div className="detail__row">
        <dt>型号</dt>
        <dd className="detail__mono">{labware.name}</dd>
      </div>
      <div className="detail__row">
        <dt>规格</dt>
        <dd>
          {labware.rows} × {labware.cols}
          {labware.tipVolumeUl ? ` · ${labware.tipVolumeUl}µL` : ''}
        </dd>
      </div>
      {wellCount > 0 ? (
        <div className="detail__row">
          <dt>已用孔位</dt>
          <dd>{wellCount}</dd>
        </div>
      ) : null}
    </dl>
  )
}

// 将槽位按 OT-2 布局排成 4 行 3 列（10-12 在顶部，1-3 在底部）
function buildDeckRows(deck: DeckSlot[]): DeckSlot[][] {
  const bySlot = new Map(deck.map((item) => [item.slot, item]))
  const rows: DeckSlot[][] = []
  for (let base = 10; base >= 1; base -= 3) {
    const row: DeckSlot[] = []
    for (let offset = 0; offset < 3; offset += 1) {
      const slotNumber = base + offset
      row.push(bySlot.get(slotNumber) ?? { slot: slotNumber })
    }
    rows.push(row)
  }
  return rows
}

// 统计各试剂在 deck 上的总体积
function computeReagentUsage(config: LiquidHandlerConfig): Record<string, number> {
  const usage: Record<string, number> = {}
  config.deck.forEach((slot) => {
    const wells = slot.labware?.wells
    if (!wells) return
    Object.values(wells).forEach((well) => {
      usage[well.reagent] = (usage[well.reagent] ?? 0) + well.volumeUl
    })
  })
  return usage
}

// 由 config.reagents 构建 试剂 -> 颜色 映射
function buildColorMap(config: LiquidHandlerConfig): Record<string, string> {
  return config.reagents.reduce(
    (acc, item) => {
      acc[item.reagent] = item.color
      return acc
    },
    {} as Record<string, string>
  )
}
