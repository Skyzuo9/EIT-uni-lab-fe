/** [AI] Model: Claude Opus 4.8 | 2026-07-21 | 物料孔位/枪头网格可视化 */
import { type Labware } from '../data/liquidHandler'

interface LabwareGridProps {
  labware: Labware
  colorMap: Record<string, string>
}

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// 渲染单个物料的内部布局：枪头架显示枪头点阵，孔板/试剂槽/管架显示按试剂着色的孔位
export default function LabwareGrid({ labware, colorMap }: LabwareGridProps): JSX.Element {
  if (labware.type === 'trash') {
    return (
      <div className="labware labware--trash" aria-label="废液槽">
        <span className="labware__trash-icon">♺</span>
      </div>
    )
  }

  const cells: JSX.Element[] = []
  for (let row = 0; row < labware.rows; row += 1) {
    for (let col = 0; col < labware.cols; col += 1) {
      const position = `${ROW_LABELS[row] ?? row}${col + 1}`
      cells.push(renderCell(labware, position, colorMap))
    }
  }

  return (
    <div
      className={`labware labware--${labware.type}`}
      style={{ gridTemplateColumns: `repeat(${labware.cols}, 1fr)` }}
    >
      {cells}
    </div>
  )
}

// 渲染单个孔位（或枪头位）
function renderCell(
  labware: Labware,
  position: string,
  colorMap: Record<string, string>
): JSX.Element {
  if (labware.type === 'tip_rack') {
    return <span className="cell cell--tip" key={position} title={`枪头 ${position}`} />
  }

  const well = labware.wells?.[position]
  if (!well) {
    return <span className="cell cell--empty" key={position} title={`${position} · 空`} />
  }

  const color = colorMap[well.reagent] ?? '#adb5bd'
  return (
    <span
      className="cell cell--filled"
      key={position}
      style={{ backgroundColor: color }}
      title={`${position} · ${well.reagent} · ${well.volumeUl}µL`}
    />
  )
}
