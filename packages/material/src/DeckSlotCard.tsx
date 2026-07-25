/** [AI] Model: Claude Opus 4.8 | 2026-07-21 | deck 槽位卡片 */
import LabwareGrid from './LabwareGrid'
import type { DeckSlot } from './liquidHandler'

interface DeckSlotCardProps {
  slot: DeckSlot
  colorMap: Record<string, string>
  selected: boolean
  onSelect: (slot: number) => void
}

const LABWARE_TYPE_LABEL: Record<string, string> = {
  tip_rack: '枪头架',
  plate: '孔板',
  reservoir: '试剂槽',
  tube_rack: '管架',
  trash: '废液'
}

// deck 上单个槽位：空槽显示占位，有物料时显示物料网格与名称
export default function DeckSlotCard({
  slot,
  colorMap,
  selected,
  onSelect
}: DeckSlotCardProps): React.JSX.Element {
  const { labware } = slot
  const isEmpty = !labware

  return (
    <button
      type="button"
      className={`slot${isEmpty ? ' slot--empty' : ''}${selected ? ' slot--selected' : ''}`}
      onClick={() => onSelect(slot.slot)}
    >
      <div className="slot__top">
        <span className="slot__index">{slot.slot}</span>
        {labware ? (
          <span className="slot__type">{LABWARE_TYPE_LABEL[labware.type] ?? labware.type}</span>
        ) : (
          <span className="slot__type slot__type--muted">空位</span>
        )}
      </div>
      <div className="slot__body">
        {labware ? (
          <LabwareGrid labware={labware} colorMap={colorMap} />
        ) : (
          <span className="slot__placeholder">+</span>
        )}
      </div>
      {labware ? <div className="slot__name">{labware.displayName}</div> : null}
    </button>
  )
}
