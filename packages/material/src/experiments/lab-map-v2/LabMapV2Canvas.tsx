import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent
} from 'react'

import type {
  MaterialAggregate,
  MaterialId
} from '../../types'
import {
  buildLabMapScene,
  polygonPoints,
  worldToMapPoint
} from './projection'
import {
  createLabMapDraftEquipment,
  equipmentTemplate,
  LAB_MAP_EQUIPMENT_TEMPLATES,
  moveLabMapDraftEquipment,
  removeLabMapDraftEquipment,
  rotateLabMapDraftEquipment,
  type LabMapDraftEquipment,
  type LabMapEquipmentTemplate
} from './draftEquipment'
import {
  EquipmentIsoGraphic,
  EquipmentThumbnail
} from './EquipmentVisual'
import type {
  LabMapBounds,
  LabMapDocument,
  LabMapMaterialObject,
  LabMapPoint,
  LabMapPolygon
} from './types'

export interface LabMapV2CanvasProps {
  map: LabMapDocument
  aggregates: readonly MaterialAggregate[]
  selectedMaterialIds?: readonly MaterialId[]
  highlightedMaterialIds?: readonly MaterialId[]
  draftEquipment?: readonly LabMapDraftEquipment[]
  onDraftEquipmentChange?: (
    equipment: readonly LabMapDraftEquipment[]
  ) => void
  onSelectionChange?: (materialIds: readonly MaterialId[]) => void
}

interface PanState {
  pointerId: number
  clientX: number
  clientY: number
  view: LabMapBounds
}

interface DraftDragState {
  pointerId: number
  equipmentId: string
  offsetMm: LabMapPoint
}

export function LabMapV2Canvas({
  map,
  aggregates,
  selectedMaterialIds = [],
  highlightedMaterialIds = [],
  draftEquipment = [],
  onDraftEquipmentChange,
  onSelectionChange
}: LabMapV2CanvasProps): React.JSX.Element {
  const scene = useMemo(
    () => buildLabMapScene(map, aggregates),
    [aggregates, map]
  )
  const [view, setView] = useState<LabMapBounds>(scene.bounds)
  const [cursorMm, setCursorMm] =
    useState<LabMapPoint | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isEquipmentCatalogOpen, setIsEquipmentCatalogOpen] =
    useState(false)
  const [selectedDraftId, setSelectedDraftId] =
    useState<string | null>(null)
  const pan = useRef<PanState | null>(null)
  const draftDrag = useRef<DraftDragState | null>(null)
  const moved = useRef(false)
  const gridPatternId = useId().replaceAll(':', '')
  const selected = new Set(selectedMaterialIds)
  const highlighted = new Set(highlightedMaterialIds)
  const selectedObject = scene.objects.find((object) =>
    selected.has(object.materialId)
  )
  const selectedDraft = draftEquipment.find(
    (equipment) => equipment.id === selectedDraftId
  )
  const selectedDraftTemplate = selectedDraft
    ? equipmentTemplate(selectedDraft.templateId)
    : undefined
  const mapAreaM2 = polygonArea(map.boundary) / 1_000_000
  const materialOrigin = worldToMapPoint(
    map.materialFrame.originMm
  )

  useEffect(() => {
    setView(scene.bounds)
  }, [scene.bounds])

  useEffect(() => {
    if (selectedMaterialIds.length > 0) setSelectedDraftId(null)
  }, [selectedMaterialIds])

  const fit = (): void => setView(scene.bounds)
  const zoom = (
    factor: number,
    anchor?: LabMapPoint
  ): void => {
    setView((current) =>
      zoomView(
        current,
        scene.bounds,
        factor,
        anchor ?? [
          current.minX + current.width / 2,
          current.minY + current.height / 2
        ]
      )
    )
  }

  const select = (
    materialId: MaterialId,
    additive: boolean
  ): void => {
    setSelectedDraftId(null)
    if (!additive) {
      onSelectionChange?.([materialId])
      return
    }
    onSelectionChange?.(
      selected.has(materialId)
        ? selectedMaterialIds.filter((id) => id !== materialId)
        : [...selectedMaterialIds, materialId]
    )
  }

  const addDraftEquipment = (
    templateId: string
  ): void => {
    if (!onDraftEquipmentChange) return
    const draft = createLabMapDraftEquipment({
      id: createDraftEquipmentId(),
      templateId,
      positionMm: draftSpawnPoint(map, draftEquipment.length)
    })
    onDraftEquipmentChange([...draftEquipment, draft])
    onSelectionChange?.([])
    setSelectedDraftId(draft.id)
  }

  const selectDraft = (equipmentId: string): void => {
    onSelectionChange?.([])
    setSelectedDraftId(equipmentId)
  }

  const beginDraftDrag = (
    event: PointerEvent<SVGGElement>,
    equipment: LabMapDraftEquipment
  ): void => {
    if (event.button !== 0 || !onDraftEquipmentChange) return
    event.stopPropagation()
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const point = clientToWorldPoint(event, view, svg)
    if (!point) return
    svg.setPointerCapture(event.pointerId)
    moved.current = false
    draftDrag.current = {
      pointerId: event.pointerId,
      equipmentId: equipment.id,
      offsetMm: [
        point[0] - equipment.positionMm[0],
        point[1] - equipment.positionMm[1]
      ]
    }
    selectDraft(equipment.id)
  }

  const beginPan = (
    event: PointerEvent<SVGSVGElement>
  ): void => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pan.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view
    }
    moved.current = false
    setIsPanning(true)
  }

  const movePointer = (
    event: PointerEvent<SVGSVGElement>
  ): void => {
    const point = clientToMapPoint(event, view)
    if (point) setCursorMm([point[0], -point[1]])
    const activeDraft = draftDrag.current
    if (
      activeDraft &&
      activeDraft.pointerId === event.pointerId &&
      point &&
      onDraftEquipmentChange
    ) {
      const item = draftEquipment.find(
        (equipment) =>
          equipment.id === activeDraft.equipmentId
      )
      const template = item
        ? equipmentTemplate(item.templateId)
        : undefined
      if (!item || !template) return
      moved.current = true
      const target: LabMapPoint = [
        point[0] - activeDraft.offsetMm[0],
        -point[1] - activeDraft.offsetMm[1]
      ]
      onDraftEquipmentChange(
        moveLabMapDraftEquipment(
          draftEquipment,
          item.id,
          clampDraftPosition(map.boundary, template, item, target)
        )
      )
      return
    }
    const active = pan.current
    if (!active || active.pointerId !== event.pointerId) return
    const box = event.currentTarget.getBoundingClientRect()
    if (!box.width || !box.height) return
    const deltaX = event.clientX - active.clientX
    const deltaY = event.clientY - active.clientY
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      moved.current = true
    }
    setView({
      ...active.view,
      minX:
        active.view.minX -
        deltaX * active.view.width / box.width,
      minY:
        active.view.minY -
        deltaY * active.view.height / box.height
    })
  }

  const endPan = (
    event: PointerEvent<SVGSVGElement>
  ): void => {
    if (draftDrag.current?.pointerId === event.pointerId) {
      draftDrag.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }
    if (pan.current?.pointerId !== event.pointerId) return
    pan.current = null
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const wheel = (event: WheelEvent<SVGSVGElement>): void => {
    event.preventDefault()
    const anchor = clientToMapPoint(event, view)
    zoom(Math.exp(-event.deltaY * 0.0012), anchor ?? undefined)
  }

  const viewBox = [
    view.minX,
    view.minY,
    view.width,
    view.height
  ].join(' ')
  const zoomPercent = Math.round(
    scene.bounds.width / view.width * 100
  )

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#07111f] text-[#d9e8f5]"
      data-experimental-lab-map-v2
    >
      <header className="z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 bg-[#091525]/95 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl">
        <div className="flex min-w-[210px] flex-1 items-center gap-2.5">
          <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#22d3ee]/30 bg-[#0c2536] shadow-[inset_0_0_18px_rgba(34,211,238,0.1)]">
            <i className="h-2.5 w-2.5 rounded-full border-2 border-[#67e8f9] shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
            <i className="absolute inset-1.5 rounded-full border border-[#22d3ee]/20" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] text-[#22d3ee]">
                Lab Map
              </span>
              <span className="rounded border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-[#fbbf24]">
                EXPERIMENT
              </span>
            </div>
            <strong className="mt-0.5 block truncate text-[12px] font-semibold text-[#f8fafc]">
              {map.name}
            </strong>
            <span className="block truncate text-[9px] text-[#7892a8]">
              手动建图 · 工站坐标已校准 ·
              {' '}
              {scene.objects.length} 个 OS 对象
            </span>
          </div>
        </div>
        <button
          type="button"
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#22d3ee]/25 bg-[#22d3ee]/[0.07] px-2.5 text-[9px] font-semibold text-[#a5f3fc] hover:border-[#22d3ee]/50 hover:bg-[#22d3ee]/12"
          aria-expanded={isEquipmentCatalogOpen}
          onClick={() =>
            setIsEquipmentCatalogOpen((current) => !current)
          }
        >
          <span className="text-sm leading-none">＋</span>
          添加设备
        </button>
        <div
          className="flex shrink-0 items-center rounded-lg border border-white/10 bg-white/[0.04] p-0.5"
          role="group"
          aria-label="地图视野控制"
        >
          <MapButton label="缩小" onClick={() => zoom(0.8)}>
            −
          </MapButton>
          <button
            type="button"
            data-lab-map-zoom-percent={zoomPercent}
            aria-label="适配视野"
            className="h-7 min-w-12 border-x border-y-0 border-white/10 bg-transparent px-2 font-mono text-[9px] font-medium text-[#b8cedf] hover:bg-white/[0.06]"
            onClick={fit}
          >
            {zoomPercent}%
          </button>
          <MapButton label="放大" onClick={() => zoom(1.25)}>
            +
          </MapButton>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <svg
          aria-label="实验室空间地图 V2"
          className={`h-full w-full touch-none ${
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          role="application"
          viewBox={viewBox}
          onClick={() => {
            if (!moved.current) {
              onSelectionChange?.([])
              setSelectedDraftId(null)
            }
            moved.current = false
          }}
          onPointerCancel={endPan}
          onPointerDown={beginPan}
          onPointerLeave={() => setCursorMm(null)}
          onPointerMove={movePointer}
          onPointerUp={endPan}
          onWheel={wheel}
        >
          <defs>
            <radialGradient
              id={`${gridPatternId}-background`}
              cx="50%"
              cy="44%"
              r="72%"
            >
              <stop offset="0%" stopColor="#10243a" />
              <stop offset="100%" stopColor="#060e19" />
            </radialGradient>
            <pattern
              id={`${gridPatternId}-minor`}
              width="100"
              height="100"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 100 0 L 0 0 0 100"
                fill="none"
                stroke="#2a4660"
                strokeOpacity="0.28"
                strokeWidth="5"
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
            <pattern
              id={gridPatternId}
              width="500"
              height="500"
              patternUnits="userSpaceOnUse"
            >
              <rect
                width="500"
                height="500"
                fill={`url(#${gridPatternId}-minor)`}
              />
              <path
                d="M 500 0 L 0 0 0 500"
                fill="none"
                stroke="#4f708c"
                strokeOpacity="0.5"
                strokeWidth="7"
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
            <filter
              id={`${gridPatternId}-shadow`}
              x="-30%"
              y="-30%"
              width="170%"
              height="180%"
            >
              <feDropShadow
                dx="22"
                dy="34"
                floodColor="#020617"
                floodOpacity="0.65"
                stdDeviation="30"
              />
            </filter>
            <filter
              id={`${gridPatternId}-origin-glow`}
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feDropShadow
                dx="0"
                dy="0"
                floodColor="#22d3ee"
                floodOpacity="0.8"
                stdDeviation="22"
              />
            </filter>
          </defs>

          <rect
            x={view.minX}
            y={view.minY}
            width={view.width}
            height={view.height}
            fill={`url(#${gridPatternId}-background)`}
          />
          <polygon
            points={polygonPoints(map.boundary)}
            fill="#0d1c2e"
            stroke="#5d7890"
            strokeWidth="14"
            vectorEffect="non-scaling-stroke"
          />
          <polygon
            points={polygonPoints(map.boundary)}
            fill={`url(#${gridPatternId})`}
            opacity="0.8"
          />

          {map.zones.map((zone) => (
            <g
              key={zone.id}
              data-lab-map-zone={zone.id}
            >
              <polygon
                points={polygonPoints(zone.polygon)}
                fill={zone.color}
                fillOpacity="0.1"
                stroke={zone.color}
                strokeOpacity="0.48"
                strokeWidth="9"
                strokeDasharray="30 22"
                vectorEffect="non-scaling-stroke"
              />
              <MapLabel
                point={polygonCenter(zone.polygon)}
                text={zone.name}
              />
            </g>
          ))}

          {map.obstacles.map((obstacle) => (
            <g
              key={obstacle.id}
              data-lab-map-obstacle={obstacle.id}
            >
              <polygon
                points={polygonPoints(obstacle.polygon)}
                fill="#23364a"
                stroke="#7892a8"
                strokeWidth="12"
                vectorEffect="non-scaling-stroke"
              />
              <MapLabel
                point={polygonCenter(obstacle.polygon)}
                text={obstacle.name}
              />
            </g>
          ))}

          {map.walls.map((wall) => {
            const start = worldToMapPoint(wall.startMm)
            const end = worldToMapPoint(wall.endMm)
            return (
              <line
                key={wall.id}
                data-lab-map-wall={wall.id}
                x1={start[0]}
                y1={start[1]}
                x2={end[0]}
                y2={end[1]}
                stroke="#b5c9d8"
                strokeLinecap="square"
                strokeWidth={wall.thicknessMm}
              />
            )
          })}

          {map.openings.map((opening) => {
            const start = worldToMapPoint(opening.startMm)
            const end = worldToMapPoint(opening.endMm)
            return (
              <line
                key={opening.id}
                data-lab-map-opening={opening.id}
                x1={start[0]}
                y1={start[1]}
                x2={end[0]}
                y2={end[1]}
                stroke="#22d3ee"
                strokeDasharray="80 35"
                strokeWidth="28"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {map.utilities.map((utility) => {
            const point = worldToMapPoint(utility.positionMm)
            return (
              <g
                key={utility.id}
                data-lab-map-utility={utility.id}
                transform={`translate(${point[0]} ${point[1]})`}
              >
                <circle
                  r="95"
                  fill="#0a1b2b"
                  stroke="#2dd4bf"
                  strokeWidth="12"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  y="28"
                  textAnchor="middle"
                  fontSize="86"
                  fontWeight="700"
                  fill="#5eead4"
                >
                  {utilityGlyph(utility.kind)}
                </text>
                <text
                  y="-135"
                  textAnchor="middle"
                  fontSize="95"
                  fontWeight="600"
                  fill="#90aabe"
                >
                  {utility.name}
                </text>
              </g>
            )
          })}

          <g
            data-lab-map-material-origin
            transform={`translate(${materialOrigin[0]} ${materialOrigin[1]})`}
          >
            <circle
              r="115"
              fill="#07111f"
              fillOpacity="0.9"
              stroke="#22d3ee"
              strokeDasharray="28 18"
              strokeWidth="10"
              vectorEffect="non-scaling-stroke"
              filter={`url(#${gridPatternId}-origin-glow)`}
            />
            <path
              d="M -170 0 H 170 M 0 -170 V 170"
              fill="none"
              stroke="#67e8f9"
              strokeWidth="8"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x="175"
              y="-155"
              fontSize="88"
              fontWeight="700"
              fill="#67e8f9"
            >
              工站原点
            </text>
          </g>

          {scene.objects.map((object) => (
            <MapMaterial
              key={object.materialId}
              object={object}
              selected={selected.has(object.materialId)}
              highlighted={highlighted.has(object.materialId)}
              shadowId={`${gridPatternId}-shadow`}
              onSelect={(event) => {
                event.stopPropagation()
                select(
                  object.materialId,
                  event.ctrlKey || event.metaKey
                )
              }}
            />
          ))}

          {draftEquipment.map((equipment) => {
            const template = equipmentTemplate(
              equipment.templateId
            )
            if (!template) return null
            return (
              <MapDraftEquipment
                key={equipment.id}
                equipment={equipment}
                template={template}
                selected={equipment.id === selectedDraftId}
                shadowId={`${gridPatternId}-shadow`}
                onPointerDown={(event) =>
                  beginDraftDrag(event, equipment)
                }
                onSelect={(event) => {
                  event.stopPropagation()
                  selectDraft(equipment.id)
                }}
              />
            )
          })}
        </svg>

        {isEquipmentCatalogOpen ? (
          <EquipmentCatalog
            onAdd={addDraftEquipment}
            onClose={() => setIsEquipmentCatalogOpen(false)}
          />
        ) : (
          <aside className="pointer-events-none absolute left-3 top-3 z-10 w-44 rounded-xl border border-white/10 bg-[#091525]/90 p-3 shadow-[0_16px_38px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <strong className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#7dd3fc]">
              Space Model
            </strong>
            <span className="font-mono text-[8px] text-[#526d83]">
              REV.{map.revision}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <MapMetric
              label="面积"
              value={`${mapAreaM2.toFixed(1)} m²`}
            />
            <MapMetric
              label="区域"
              value={`${map.zones.length}`}
            />
          </div>
          <div className="my-2.5 h-px bg-white/[0.07]" />
          <div className="grid gap-1.5 text-[9px] text-[#8fa8ba]">
            {map.zones.map((zone) => (
              <Legend
                key={zone.id}
                color={zone.color}
                label={zone.name}
              />
            ))}
            <Legend color="#b5c9d8" label="墙体与固定障碍" />
          </div>
          </aside>
        )}

        {selectedDraft && selectedDraftTemplate ? (
          <DraftEquipmentInspector
            equipment={selectedDraft}
            template={selectedDraftTemplate}
            onDelete={() => {
              onDraftEquipmentChange?.(
                removeLabMapDraftEquipment(
                  draftEquipment,
                  selectedDraft.id
                )
              )
              setSelectedDraftId(null)
            }}
            onRotate={() => {
              onDraftEquipmentChange?.(
                rotateLabMapDraftEquipment(
                  draftEquipment,
                  selectedDraft.id
                )
              )
            }}
          />
        ) : selectedObject ? (
          <aside
            className="absolute right-3 top-3 z-10 w-52 rounded-xl border border-[#22d3ee]/20 bg-[#091525]/95 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl"
            data-lab-map-selection={selectedObject.materialId}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#22d3ee] shadow-[0_0_10px_rgba(34,211,238,0.75)]" />
              <div className="min-w-0">
                <span className="block text-[8px] font-bold uppercase tracking-[0.14em] text-[#22d3ee]">
                  Selected Object
                </span>
                <strong className="mt-0.5 block truncate text-xs text-[#f8fafc]">
                  {selectedObject.name}
                </strong>
                <span className="font-mono text-[9px] text-[#7892a8]">
                  {selectedObject.code}
                </span>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-[52px_1fr] gap-y-1.5 text-[9px]">
              <dt className="text-[#607b91]">地图位置</dt>
              <dd className="text-right font-mono font-medium text-[#c8dbe9]">
                {Math.round(selectedObject.pose.positionMm[0])},
                {' '}
                {Math.round(selectedObject.pose.positionMm[1])} mm
              </dd>
              <dt className="text-[#607b91]">OS 坐标</dt>
              <dd className="text-right font-mono font-medium text-[#8fa8ba]">
                {Math.round(selectedObject.sourcePose.positionMm[0])},
                {' '}
                {Math.round(selectedObject.sourcePose.positionMm[1])} mm
              </dd>
              <dt className="text-[#607b91]">占地</dt>
              <dd className="text-right font-mono font-medium text-[#c8dbe9]">
                {Math.round(selectedObject.footprintMm[0])} ×
                {' '}
                {Math.round(selectedObject.footprintMm[1])} mm
              </dd>
              <dt className="text-[#607b91]">几何</dt>
              <dd
                className={`text-right font-medium ${
                  selectedObject.geometryStatus === 'authoritative'
                    ? 'text-[#34d399]'
                    : 'text-[#fbbf24]'
                }`}
              >
                {selectedObject.geometryStatus === 'authoritative'
                  ? '权威尺寸'
                  : '缺少尺寸'}
              </dd>
            </dl>
          </aside>
        ) : null}
      </div>

      <footer className="z-20 flex h-7 shrink-0 items-center gap-3 border-t border-white/10 bg-[#091525] px-3 font-mono text-[9px] text-[#6e889d]">
        <span className="text-[#a6bdce]">
          {cursorMm
            ? `X ${Math.round(cursorMm[0])} · Y ${Math.round(cursorMm[1])} mm`
            : '移动指针查看坐标'}
        </span>
        <span className="hidden sm:inline">GRID 500 mm</span>
        <span className="ml-auto hidden md:inline">
          滚轮缩放 · 拖动画布平移 · Ctrl/⌘ 多选
        </span>
        <span className="ml-auto md:hidden">缩放 · 平移 · 多选</span>
      </footer>
    </div>
  )
}

function EquipmentCatalog({
  onAdd,
  onClose
}: {
  onAdd: (templateId: string) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <aside
      className="pointer-events-auto absolute bottom-3 left-3 top-3 z-20 flex w-56 flex-col overflow-hidden rounded-xl border border-[#22d3ee]/20 bg-[#081422]/95 shadow-[0_18px_48px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      data-lab-map-equipment-catalog
    >
      <header className="flex items-center border-b border-white/[0.07] px-3 py-2.5">
        <div className="min-w-0">
          <span className="block text-[8px] font-bold uppercase tracking-[0.16em] text-[#22d3ee]">
            Equipment Library
          </span>
          <strong className="mt-0.5 block text-[11px] text-[#f1f7fb]">
            新建设备草稿
          </strong>
        </div>
        <button
          type="button"
          aria-label="关闭设备库"
          className="ml-auto h-7 w-7 rounded-lg border border-white/10 bg-transparent text-sm text-[#7892a8] hover:bg-white/[0.06] hover:text-white"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {LAB_MAP_EQUIPMENT_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              aria-label={`添加${template.name}`}
              className="group min-h-[92px] rounded-lg border border-white/[0.08] bg-white/[0.025] p-2 text-left hover:border-[#22d3ee]/35 hover:bg-[#22d3ee]/[0.06]"
              data-equipment-template-id={template.id}
              onClick={() => onAdd(template.id)}
            >
              <span
                className="relative mb-2 grid h-14 place-items-center overflow-hidden rounded-md border border-white/10"
                style={{
                  background: `linear-gradient(145deg, ${template.color}30, #081422 72%)`
                }}
              >
                <EquipmentThumbnail template={template} />
              </span>
              <strong className="block truncate text-[9px] font-semibold text-[#d9e9f3] group-hover:text-white">
                {template.name}
              </strong>
              <span className="mt-1 block font-mono text-[7px] text-[#587287]">
                {template.footprintMm[0]} ×
                {' '}
                {template.footprintMm[1]}
              </span>
            </button>
          ))}
        </div>
      </div>
      <footer className="border-t border-white/[0.07] px-3 py-2 text-[8px] leading-4 text-[#607b91]">
        添加后拖拽排布 · 100 mm 网格吸附
        <br />
        仅保存为地图草稿，不写入 OS
      </footer>
    </aside>
  )
}

function DraftEquipmentInspector({
  equipment,
  template,
  onDelete,
  onRotate
}: {
  equipment: LabMapDraftEquipment
  template: LabMapEquipmentTemplate
  onDelete: () => void
  onRotate: () => void
}): React.JSX.Element {
  return (
    <aside
      className="pointer-events-auto absolute right-3 top-3 z-10 w-52 rounded-xl border border-[#a78bfa]/25 bg-[#091525]/95 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.32)] backdrop-blur-xl"
      data-lab-map-draft-selection={equipment.id}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: template.color,
            boxShadow: `0 0 10px ${template.color}`
          }}
        />
        <div className="min-w-0">
          <span className="block text-[8px] font-bold uppercase tracking-[0.14em] text-[#c4b5fd]">
            Map Draft
          </span>
          <strong className="mt-0.5 block truncate text-xs text-[#f8fafc]">
            {equipment.name}
          </strong>
          <span className="font-mono text-[9px] text-[#7892a8]">
            {template.code} · 尚未同步 OS
          </span>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[48px_1fr] gap-y-1.5 text-[9px]">
        <dt className="text-[#607b91]">地图位置</dt>
        <dd className="text-right font-mono text-[#c8dbe9]">
          {Math.round(equipment.positionMm[0])},
          {' '}
          {Math.round(equipment.positionMm[1])} mm
        </dd>
        <dt className="text-[#607b91]">占地</dt>
        <dd className="text-right font-mono text-[#c8dbe9]">
          {template.footprintMm[0]} ×
          {' '}
          {template.footprintMm[1]} mm
        </dd>
        <dt className="text-[#607b91]">旋转</dt>
        <dd className="text-right font-mono text-[#c8dbe9]">
          {equipment.rotationDeg}°
        </dd>
      </dl>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-2.5">
        <button
          type="button"
          className="h-7 rounded-lg border border-white/10 bg-white/[0.035] text-[8px] font-medium text-[#b8cedf] hover:bg-white/[0.07]"
          onClick={onRotate}
        >
          旋转 90°
        </button>
        <button
          type="button"
          className="h-7 rounded-lg border border-[#fb7185]/20 bg-[#fb7185]/[0.05] text-[8px] font-medium text-[#fda4af] hover:bg-[#fb7185]/10"
          onClick={onDelete}
        >
          删除草稿
        </button>
      </div>
    </aside>
  )
}

function MapDraftEquipment({
  equipment,
  template,
  selected,
  shadowId,
  onPointerDown,
  onSelect
}: {
  equipment: LabMapDraftEquipment
  template: LabMapEquipmentTemplate
  selected: boolean
  shadowId: string
  onPointerDown: (event: PointerEvent<SVGGElement>) => void
  onSelect: (event: MouseEvent<SVGGElement>) => void
}): React.JSX.Element {
  const footprint = draftFootprint(equipment, template)
  const screen = footprint.map(worldToMapPoint)
  const elevation = clamp(template.heightMm * 0.14, 45, 190)
  const bounds = polygonBounds(screen)
  const center = polygonCenterFromScreen(screen)
  const scaleX = Math.max(bounds.width / 145, 1)
  const scaleY = Math.max(
    (bounds.height + elevation) / 105,
    1
  )
  const border = selected ? '#e0f2fe' : template.color

  return (
    <g
      aria-label={`${equipment.name}，地图草稿设备，可拖拽`}
      className="cursor-grab active:cursor-grabbing"
      data-lab-map-draft-id={equipment.id}
      data-lab-map-draft-template-id={template.id}
      data-position-x={equipment.positionMm[0]}
      data-position-y={equipment.positionMm[1]}
      data-rotation={equipment.rotationDeg}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect(event as unknown as MouseEvent<SVGGElement>)
      }}
      onPointerDown={onPointerDown}
    >
      <polygon
        points={pointsAttr(screen)}
        fill={template.color}
        fillOpacity={selected ? 0.18 : 0.08}
        stroke={border}
        strokeDasharray={selected ? undefined : '28 14'}
        strokeWidth={selected ? 18 : 11}
        vectorEffect="non-scaling-stroke"
        filter={`url(#${shadowId})`}
      />
      <g
        pointerEvents="none"
        transform={[
          `translate(${center[0]} ${bounds.maxY})`,
          `scale(${scaleX} ${scaleY})`,
          'translate(-80 -100)'
        ].join(' ')}
      >
        <EquipmentIsoGraphic
          accent={template.color}
          templateId={template.id}
        />
      </g>
      <MapObjectLabel
        x={center[0]}
        y={bounds.minY - elevation - 100}
        code={`${template.code} · DRAFT`}
      />
    </g>
  )
}

function MapMaterial({
  object,
  selected,
  highlighted,
  shadowId,
  onSelect
}: {
  object: LabMapMaterialObject
  selected: boolean
  highlighted: boolean
  shadowId: string
  onSelect: (event: MouseEvent<SVGGElement>) => void
}): React.JSX.Element {
  const screen = object.footprint.map(worldToMapPoint)
  const elevation = clamp(object.heightMm * 0.16, 28, 170)
  const offset: LabMapPoint = [elevation * 0.34, -elevation]
  const top = screen.map(
    ([x, y]): LabMapPoint => [x + offset[0], y + offset[1]]
  )
  const baseColor = materialColor(object.kind)
  const topColor = selected
    ? '#22d3ee'
    : highlighted
      ? '#60a5fa'
      : baseColor
  const borderColor = selected
    ? '#a5f3fc'
    : highlighted
      ? '#bfdbfe'
      : '#6b879d'
  const center = polygonCenterFromScreen(top)

  if (object.geometryStatus === 'missing') {
    const point = worldToMapPoint([
      object.pose.positionMm[0],
      object.pose.positionMm[1]
    ])
    return (
      <g
        aria-label={`${object.name}，缺少权威几何尺寸`}
        data-geometry-status="missing"
        data-material-id={object.materialId}
        role="button"
        tabIndex={0}
        transform={`translate(${point[0]} ${point[1]})`}
        onClick={onSelect}
        onKeyDown={(event) => keyboardSelect(event, onSelect)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <circle
          r="90"
          fill="#2b1b0a"
          stroke="#f59e0b"
          strokeDasharray="28 18"
          strokeWidth="12"
          vectorEffect="non-scaling-stroke"
        />
        <text
          y="30"
          textAnchor="middle"
          fontSize="100"
          fontWeight="800"
          fill="#fbbf24"
        >
          !
        </text>
        <MapObjectLabel
          x={0}
          y={-145}
          code={object.code}
        />
      </g>
    )
  }

  return (
    <g
      aria-label={`${object.name}，${Math.round(object.footprintMm[0])} × ${Math.round(object.footprintMm[1])} 毫米`}
      data-geometry-status="authoritative"
      data-material-id={object.materialId}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => keyboardSelect(event, onSelect)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <polygon
        points={pointsAttr(screen)}
        fill="#020617"
        fillOpacity="0.58"
        filter={`url(#${shadowId})`}
      />
      <polygon
        points={pointsAttr([
          screen[0],
          screen[1],
          top[1],
          top[0]
        ])}
        fill="#263b4d"
        stroke={borderColor}
        strokeWidth="10"
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={pointsAttr([
          screen[1],
          screen[2],
          top[2],
          top[1]
        ])}
        fill="#1b2d3d"
        stroke={borderColor}
        strokeWidth="10"
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={pointsAttr(top)}
        fill={topColor}
        stroke={borderColor}
        strokeWidth={selected ? 18 : 10}
        vectorEffect="non-scaling-stroke"
      />
      <MapObjectLabel
        x={center[0]}
        y={center[1]}
        code={object.code || object.name}
      />
    </g>
  )
}

function MapObjectLabel({
  x,
  y,
  code
}: {
  x: number
  y: number
  code: string
}): React.JSX.Element {
  const width = Math.max(360, Math.min(code.length * 92, 900))
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={-width / 2}
        y="-70"
        width={width}
        height="140"
        rx="55"
        fill="#07111f"
        fillOpacity="0.96"
        stroke="#49677f"
        strokeWidth="8"
        vectorEffect="non-scaling-stroke"
      />
      <text
        y="30"
        textAnchor="middle"
        fontSize="92"
        fontWeight="700"
        fill="#e4f2fa"
      >
        {code}
      </text>
    </g>
  )
}

function MapLabel({
  point,
  text
}: {
  point: LabMapPoint
  text: string
}): React.JSX.Element {
  const screen = worldToMapPoint(point)
  return (
    <text
      x={screen[0]}
      y={screen[1]}
      textAnchor="middle"
      fontSize="150"
      fontWeight="700"
      fill="#92aec1"
      fillOpacity="0.78"
      pointerEvents="none"
    >
      {text}
    </text>
  )
}

function MapButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      className="h-7 w-8 border-0 bg-transparent text-sm font-semibold text-[#a7bece] hover:bg-white/[0.07] hover:text-[#e6f4fb]"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Legend({
  color,
  label
}: {
  color: string
  label: string
}): React.JSX.Element {
  return (
    <span className="flex items-center gap-2">
      <i
        className="h-2 w-2 rounded-sm border border-white/15"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}66`
        }}
      />
      {label}
    </span>
  )
}

function MapMetric({
  label,
  value
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <span className="rounded-lg border border-white/[0.07] bg-white/[0.035] px-2 py-1.5">
      <small className="block text-[8px] text-[#607b91]">
        {label}
      </small>
      <strong className="mt-0.5 block font-mono text-[10px] font-semibold text-[#d8e8f3]">
        {value}
      </strong>
    </span>
  )
}

function zoomView(
  current: LabMapBounds,
  fitted: LabMapBounds,
  factor: number,
  anchor: LabMapPoint
): LabMapBounds {
  const minimumWidth = Math.max(fitted.width * 0.12, 500)
  const maximumWidth = fitted.width * 8
  const width = clamp(
    current.width / factor,
    minimumWidth,
    maximumWidth
  )
  const ratio = width / current.width
  const height = current.height * ratio
  return {
    minX: anchor[0] - (anchor[0] - current.minX) * ratio,
    minY: anchor[1] - (anchor[1] - current.minY) * ratio,
    width,
    height
  }
}

function draftFootprint(
  equipment: LabMapDraftEquipment,
  template: LabMapEquipmentTemplate
): LabMapPolygon {
  const rotation = equipment.rotationDeg * Math.PI / 180
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const halfWidth = template.footprintMm[0] / 2
  const halfDepth = template.footprintMm[1] / 2
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth]
  ].map(
    ([x, y]): LabMapPoint => [
      equipment.positionMm[0] + x * cosine - y * sine,
      equipment.positionMm[1] + x * sine + y * cosine
    ]
  )
}

function draftSpawnPoint(
  map: LabMapDocument,
  index: number
): LabMapPoint {
  const zone = map.zones.find(
    (candidate) => candidate.kind === 'automation'
  )
  const center = polygonCenter(zone?.polygon ?? map.boundary)
  const offsets: readonly LabMapPoint[] = [
    [0, 0],
    [1400, 0],
    [-1400, 0],
    [0, -1100],
    [1400, -1100],
    [-1400, -1100]
  ]
  const offset = offsets[index % offsets.length] ?? [0, 0]
  const cycle = Math.floor(index / offsets.length)
  return [
    center[0] + offset[0],
    center[1] + offset[1] - cycle * 500
  ]
}

function clampDraftPosition(
  boundary: LabMapPolygon,
  template: LabMapEquipmentTemplate,
  equipment: LabMapDraftEquipment,
  target: LabMapPoint
): LabMapPoint {
  const xs = boundary.map(([x]) => x)
  const ys = boundary.map(([, y]) => y)
  const quarterTurn =
    Math.round(equipment.rotationDeg / 90) % 2 !== 0
  const halfWidth = (
    quarterTurn
      ? template.footprintMm[1]
      : template.footprintMm[0]
  ) / 2
  const halfDepth = (
    quarterTurn
      ? template.footprintMm[0]
      : template.footprintMm[1]
  ) / 2
  return [
    clamp(
      target[0],
      Math.min(...xs) + halfWidth,
      Math.max(...xs) - halfWidth
    ),
    clamp(
      target[1],
      Math.min(...ys) + halfDepth,
      Math.max(...ys) - halfDepth
    )
  ]
}

function createDraftEquipmentId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid
    ? `map-draft-${uuid}`
    : `map-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clientToWorldPoint(
  event: { clientX: number; clientY: number },
  view: LabMapBounds,
  svg: SVGSVGElement
): LabMapPoint | null {
  const point = clientToMapPoint(
    {
      clientX: event.clientX,
      clientY: event.clientY,
      currentTarget: svg
    },
    view
  )
  return point ? [point[0], -point[1]] : null
}

function clientToMapPoint(
  event: {
    clientX: number
    clientY: number
    currentTarget: SVGSVGElement
  },
  view: LabMapBounds
): LabMapPoint | null {
  const box = event.currentTarget.getBoundingClientRect()
  if (!box.width || !box.height) return null
  return [
    view.minX +
      (event.clientX - box.left) / box.width * view.width,
    view.minY +
      (event.clientY - box.top) / box.height * view.height
  ]
}

function keyboardSelect(
  event: KeyboardEvent<SVGGElement>,
  select: (event: MouseEvent<SVGGElement>) => void
): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  select(event as unknown as MouseEvent<SVGGElement>)
}

function polygonCenter(
  polygon: LabMapPolygon
): LabMapPoint {
  if (polygon.length === 0) return [0, 0]
  return [
    polygon.reduce((total, [x]) => total + x, 0) /
      polygon.length,
    polygon.reduce((total, [, y]) => total + y, 0) /
      polygon.length
  ]
}

function polygonArea(
  polygon: LabMapPolygon
): number {
  if (polygon.length < 3) return 0
  return Math.abs(
    polygon.reduce((total, [x, y], index) => {
      const next = polygon[(index + 1) % polygon.length]
      if (!next) return total
      return total + x * next[1] - next[0] * y
    }, 0) / 2
  )
}

function polygonCenterFromScreen(
  polygon: LabMapPolygon
): LabMapPoint {
  if (polygon.length === 0) return [0, 0]
  return [
    polygon.reduce((total, [x]) => total + x, 0) /
      polygon.length,
    polygon.reduce((total, [, y]) => total + y, 0) /
      polygon.length
  ]
}

function polygonBounds(
  polygon: LabMapPolygon
): {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
} {
  const xs = polygon.map(([x]) => x)
  const ys = polygon.map(([, y]) => y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function pointsAttr(
  polygon: LabMapPolygon
): string {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ')
}

function materialColor(kind: string): string {
  const normalized = kind.toLowerCase()
  if (
    normalized.includes('robot') ||
    normalized.includes('arm')
  ) {
    return '#a78bfa'
  }
  if (
    normalized.includes('handler') ||
    normalized.includes('station') ||
    normalized.includes('device')
  ) {
    return '#38bdf8'
  }
  if (
    normalized.includes('hotel') ||
    normalized.includes('storage')
  ) {
    return '#fbbf24'
  }
  if (
    normalized.includes('plate') ||
    normalized.includes('rack') ||
    normalized.includes('labware')
  ) {
    return '#34d399'
  }
  return '#94a3b8'
}

function utilityGlyph(
  kind: string
): string {
  if (kind === 'power') return '⌁'
  if (kind === 'network') return '⌘'
  if (kind === 'gas') return 'G'
  if (kind === 'water') return 'W'
  return 'D'
}

function clamp(
  value: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(Math.max(value, minimum), maximum)
}
