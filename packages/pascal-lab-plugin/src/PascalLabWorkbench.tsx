import { emitter } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  PascalEditorHost,
  type SceneGraph
} from '@unilab/pascal-host'
import {
  MaterialCanvas,
  MaterialObliqueCanvas,
  type MaterialTransferOverlayRoute
} from '@unilab/material'
import type {
  MaterialAggregate,
  MaterialShapeLibrary
} from '@unilab/material/domain'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  type MaterialSceneMove,
  type MaterialTransferSceneRoute,
  type PascalSpatialShadowOverlay,
  materialAggregatesToSceneGraph,
  sceneGraphToMaterialMoves
} from './materialAggregateSceneBridge'
import {
  configureLabModelRuntime,
  type LabModelRuntime
} from './modelRuntime'
import {
  indexMaterialSceneObjects,
  materialIdsToSceneObjectIds
} from './materialSceneSelection'
import { shouldPausePascalRendering } from './renderActivity'
import { preparePascalLabPlugin } from './plugin'
import {
  isLabDeviceNode,
  type LabMaterialTransferLayerNode,
  isLabTableNode
} from './schema'
import type { SceneCameraView } from './sceneCameraRequest'
import { PASCAL_CAPTURE_FIT_EVENT } from './sceneCameraRequest'
import { pascalPoseToLab } from './units'

export interface PascalLabWorkbenchProps {
  aggregates: readonly MaterialAggregate[]
  /** 设备包声明的 2.5D 外形，透传给斜二测画布。 */
  shapes?: MaterialShapeLibrary
  /** 统一控制 2D、2.5D 与 3D 中的库位/点位图层。 */
  showSites?: boolean
  /** 统一控制 2D、2.5D 与 3D 中的物料/设备名称标签。 */
  showMaterialLabels?: boolean
  /** 工作流（Workflow）派生的只读物料（Material）转运路线。 */
  materialTransferRoutes?: readonly MaterialTransferSceneRoute[]
  showMaterialTransfers?: boolean
  materialTransferProjectionError?: string | null
  viewMode?: '2d' | '2.5d' | '3d' | 'split'
  /** Agent 截图使用的显式相机预设；普通交互仍由工具栏维护。 */
  cameraPreset?: SceneCameraView
  cameraRequestRevision?: number
  /** 并排调试时可把“适配场景”聚焦到具有运动学声明的设备。 */
  cameraFocus?: 'scene' | 'kinematics'
  /** 复用 Pascal WebGPU 离屏管线的宿主截图请求。 */
  captureRequest?: {
    revision: number
    width: number
    height: number
  } | null
  onCaptureReady?: (
    blob: Blob,
    cameraData: {
      position: [number, number, number]
      target: [number, number, number] | null
      type?: 'perspective' | 'orthographic'
      zoom?: number
      captureMode?: 'standard' | 'viewport' | 'area'
      resolution?: { w: number; h: number }
    }
  ) => void
  projectId?: string
  modelRuntime?: LabModelRuntime
  editable?: boolean
  selectedMaterialIds?: readonly string[]
  highlightedMaterialIds?: readonly string[]
  onMaterialMoves?: (moves: readonly MaterialSceneMove[]) => void
  onSelectionChange?: (
    materialIds: readonly string[],
    sceneObjectIds: readonly string[]
  ) => void
  spatialShadow?: {
    phase: 'loading' | 'ready' | 'error' | 'unavailable'
    message: string
    enabled: boolean
    playing: boolean
    overlay: PascalSpatialShadowOverlay | null
    onToggle: () => void
    onPlaybackToggle: () => void
    onTimeChange: (timeS: number) => void
    onReload?: () => void
  }
}

/**
 * 将物料图（Material Graph）及只读转运路线组合到 Pascal 2D/2.5D/3D 视图。
 *
 * @param props 物料聚合、形状、视图开关、选择和移动回调。
 * @returns 不拥有物料位置权威的 Pascal 实验室工作台。
 * @throws 不主动抛错；插件初始化异常在局部错误状态中展示。
 * @safety 选择与高亮只更新视图投影，物料位置仅通过注入的移动命令提交。
 */
export function PascalLabWorkbench({
  aggregates,
  shapes,
  showSites = true,
  showMaterialLabels = true,
  materialTransferRoutes = [],
  showMaterialTransfers = true,
  materialTransferProjectionError = null,
  viewMode = '3d',
  cameraPreset,
  cameraRequestRevision = 0,
  cameraFocus = 'scene',
  captureRequest = null,
  onCaptureReady,
  projectId = 'unilab-local-scene',
  modelRuntime,
  editable = false,
  selectedMaterialIds = [],
  highlightedMaterialIds = [],
  onMaterialMoves,
  onSelectionChange,
  spatialShadow
}: PascalLabWorkbenchProps): React.JSX.Element {
  const [cameraRequest, setCameraRequest] = useState<{
    revision: number
    view: SceneCameraView
  }>({ revision: 0, view: 'default' })
  useEffect(() => {
    if (!cameraPreset) return
    useViewer.getState().setCameraMode(
      cameraPreset === 'top' ? 'orthographic' : 'perspective'
    )
    setCameraRequest(({ revision }) => ({
      revision: Math.max(revision + 1, cameraRequestRevision),
      view: cameraPreset
    }))
  }, [cameraPreset, cameraRequestRevision])
  useEffect(() => {
    setCameraRequest(({ revision, view }) => ({
      revision: revision + 1,
      view
    }))
  }, [cameraFocus])
  useEffect(() => {
    if (!captureRequest || !onCaptureReady) return
    // macOS 无显示器的 managed renderer 可能没有 CVDisplayLink，rAF 不会推进。
    // 初始化早期的请求可能先于 ThumbnailGenerator 的离屏管线；有界宿主请求
    // 生命周期内重试，生成器会在 busy 时自行去重，成功后父组件会清除 request。
    const thumbnailTimers = new Set<number>()
    const emitCapture = (): void => {
      window.dispatchEvent(new CustomEvent(PASCAL_CAPTURE_FIT_EVENT, {
        detail: { view: cameraPreset ?? 'default' }
      }))
      const thumbnailTimer = window.setTimeout(() => {
        thumbnailTimers.delete(thumbnailTimer)
        emitter.emit('camera-controls:generate-thumbnail', {
          projectId,
          captureMode: 'standard',
          standardSize: {
            w: captureRequest.width,
            h: captureRequest.height
          }
        })
      }, 50)
      thumbnailTimers.add(thumbnailTimer)
    }
    const timeout = setTimeout(emitCapture, 100)
    const interval = setInterval(emitCapture, 500)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
      thumbnailTimers.forEach(timer => window.clearTimeout(timer))
    }
  }, [cameraPreset, captureRequest, onCaptureReady, projectId])
  const scene = useMemo(
    () =>
      materialAggregatesToSceneGraph(aggregates, {
        fitSceneRevision: cameraRequest.revision,
        fitSceneView: cameraRequest.view,
        fitSceneFocus: cameraFocus,
        showSites,
        showMaterialLabels,
        showMaterialTransfers,
        materialTransferRoutes,
        spatialShadowOverlay:
          spatialShadow?.enabled &&
          (viewMode === '3d' || viewMode === 'split')
            ? spatialShadow.overlay
            : null
      }),
    [
      aggregates,
      cameraRequest,
      cameraFocus,
      materialTransferRoutes,
      showMaterialTransfers,
      showMaterialLabels,
      showSites,
      spatialShadow?.enabled,
      spatialShadow?.overlay,
      viewMode
    ]
  )
  const [saveStatus, setSaveStatus] = useState<
    'saved' | 'dirty' | 'saving'
  >('saved')
  const transferLayer = (
    scene.nodes.level_unilab as {
      materialTransferLayer?: LabMaterialTransferLayerNode | null
    } | undefined
  )?.materialTransferLayer
  const transferRouteCount = transferLayer?.routes.length ?? 0
  const unresolvedTransferRouteCount =
    transferLayer?.unresolvedRouteIds.length ?? 0
  const materialTransferOverlayRoutes = useMemo<
    MaterialTransferOverlayRoute[]
  >(
    () => (transferLayer?.routes ?? []).map((route) => ({
      id: route.id,
      label: route.label,
      sourceMaterialId: route.sourceOwnerMaterialId,
      targetMaterialId: route.targetOwnerMaterialId,
      sourceLabel: route.sourceAnchorLabel,
      targetLabel: route.targetAnchorLabel,
      status: route.status,
      accent: route.accent,
      pointsMm: route.points.map((point) =>
        pascalPoseToLab(point, [0, 0, 0]).positionMm
      )
    })),
    [transferLayer]
  )
  const materialSceneSelectionIndex = useMemo(
    () => indexMaterialSceneObjects(scene),
    [scene]
  )

  const selectedSceneObjectIds = useMemo(
    () => materialIdsToSceneObjectIds(
      materialSceneSelectionIndex,
      selectedMaterialIds
    ),
    [materialSceneSelectionIndex, selectedMaterialIds]
  )
  const highlightedSceneObjectIds = useMemo(
    () => materialIdsToSceneObjectIds(
      materialSceneSelectionIndex,
      highlightedMaterialIds
    ),
    [highlightedMaterialIds, materialSceneSelectionIndex]
  )
  const reportedMaterialIdsRef = useRef<readonly string[]>(
    selectedMaterialIds
  )
  reportedMaterialIdsRef.current = selectedMaterialIds

  const reportSelectionChange = useCallback((
    materialIds: readonly string[],
    sceneObjectIds: readonly string[]
  ): void => {
    if (sameIds(reportedMaterialIdsRef.current, materialIds)) return
    // Pascal 在 pointerup 和随后 click 中可能连续发出同一选中结果。
    // 先同步 ref，避免 React 批处理提交前重复刷新整个工作台。
    reportedMaterialIdsRef.current = [...materialIds]
    onSelectionChange?.(materialIds, sceneObjectIds)
  }, [onSelectionChange])

  useEffect(() => {
    const state = useViewer.getState()
    if (!sameIds(state.selection.selectedIds, selectedSceneObjectIds)) {
      state.setSelection({
        selectedIds: [...selectedSceneObjectIds] as never[]
      })
    }
  }, [selectedSceneObjectIds])

  useEffect(() => {
    const state = useViewer.getState()
    if (!sameIds(state.previewSelectedIds, highlightedSceneObjectIds)) {
      state.setPreviewSelectedIds(
        [...highlightedSceneObjectIds] as never[]
      )
    }
  }, [highlightedSceneObjectIds])

  const prepare = useCallback(async () => {
    if (modelRuntime) configureLabModelRuntime(modelRuntime)
    await preparePascalLabPlugin()
  }, [modelRuntime])

  const handleSave = useCallback(
    async (scene: SceneGraph) => {
      if (!editable) {
        setSaveStatus('saved')
        return
      }
      setSaveStatus('saving')
      onMaterialMoves?.(
        sceneGraphToMaterialMoves(scene, aggregates)
      )
      setSaveStatus('saved')
    },
    [aggregates, editable, onMaterialMoves]
  )

  const handleSelectionChange = useCallback(
    (sceneObjectIds: readonly string[]) => {
      const materialIds = sceneObjectIds.flatMap((id) => {
        const node = scene.nodes[id]
        return isLabDeviceNode(node) || isLabTableNode(node)
          ? [node.materialNodeId]
          : []
      })
      reportSelectionChange(materialIds, sceneObjectIds)
    },
    [reportSelectionChange, scene.nodes]
  )

  const statusLabel = useMemo(() => {
    if (saveStatus === 'saving') return '正在保存'
    if (saveStatus === 'dirty') return '有未保存修改'
    const count = aggregates.length
    return editable
      ? `${count} 个物料 · 已保存`
      : `${count} 个物料 · 只读`
  }, [aggregates.length, editable, saveStatus])
  const pascalViewMode = viewMode === '2.5d' ? '3d' : viewMode

  const toolbar = (
    <div className="pascal-lab-toolbar">
      <span className="pascal-lab-toolbar__title">
        实验室 {viewMode.toUpperCase()} · Pascal
      </span>
      <span className="pascal-lab-toolbar__status">{statusLabel}</span>
      {showMaterialTransfers && (
        <span
          className="pascal-lab-toolbar__transfer-status"
          title={materialTransferProjectionError ?? (
            unresolvedTransferRouteCount > 0
              ? `${unresolvedTransferRouteCount} 条路线缺少可解析的库位（Site）坐标`
              : undefined
          )}
        >
          <i aria-hidden="true" />
          {materialTransferProjectionError
            ? '转运投影需检查'
            : transferRouteCount > 0
              ? `${transferRouteCount} 条物料转运路线`
              : materialTransferRoutes.length > 0
                ? '暂无可定位的转运路线'
                : '选择工作流以显示转运路线'}
        </span>
      )}
      {viewMode !== '2d' && (
        <div className="pascal-lab-toolbar__actions">
          {spatialShadow ? (
            <button
              type="button"
              className="pascal-lab-toolbar__button pascal-lab-toolbar__button--spatial-shadow"
              aria-pressed={spatialShadow.enabled}
              data-testid="spatial-shadow-toggle"
              disabled={spatialShadow.phase !== 'ready' || !spatialShadow.overlay}
              title={spatialShadow.message}
              onClick={spatialShadow.onToggle}
            >
              空间约束 Shadow
            </button>
          ) : null}
          <button
            type="button"
            className="pascal-lab-toolbar__button"
            onClick={() => {
              useViewer.getState().setCameraMode('orthographic')
              requestAnimationFrame(() => {
                setCameraRequest(({ revision }) => ({
                  revision: revision + 1,
                  view: 'top'
                }))
              })
            }}
          >
            顶视图
          </button>
          <button
            type="button"
            className="pascal-lab-toolbar__button"
            onClick={() => {
              useViewer.getState().setCameraMode('perspective')
              requestAnimationFrame(() => {
                setCameraRequest(({ revision }) => ({
                  revision: revision + 1,
                  view: 'default'
                }))
              })
            }}
          >
            适配场景
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div
      className={`pascal-lab-workbench${
        viewMode === '2.5d' ? ' is-oblique' : ''
      }`}
    >
      <div
        aria-hidden={viewMode === '2.5d'}
        className="pascal-lab-workbench__native"
      >
        <PascalEditorHost
          scene={scene}
          projectId={projectId}
          prepare={prepare}
          readOnly={!editable}
          editorViewMode={pascalViewMode}
          renderPaused={shouldPausePascalRendering(viewMode)}
          sceneTheme="studio"
          showGrid
          floorplanOverlay={
            <MaterialCanvas
              floorplanOverlay
              physicalLayout
              showSites={showSites}
              showMaterialLabels={showMaterialLabels}
              materialTransferRoutes={
                showMaterialTransfers ? materialTransferOverlayRoutes : []
              }
              readStatus={{ available: true }}
              moveStatus={{
                available: editable,
                reason: editable
                  ? undefined
                  : '当前服务不支持移动物料'
              }}
              selectedMaterialIds={selectedMaterialIds}
              highlightedMaterialIds={highlightedMaterialIds}
              onSelectionChange={(materialIds) => {
                reportSelectionChange(
                  materialIds,
                  materialIdsToSceneObjectIds(
                    materialSceneSelectionIndex,
                    materialIds
                  )
                )
              }}
            />
          }
          toolbar={toolbar}
          editorProps={{
            onThumbnailCapture: (blob, cameraData) =>
              onCaptureReady?.(blob, cameraData)
          }}
          onDirty={() => {
            if (editable) setSaveStatus('dirty')
          }}
          onSave={handleSave}
          onSelectionChange={handleSelectionChange}
          suppressSelectionAfterPointerDrag={
            viewMode === '3d' || viewMode === 'split'
          }
        />
      </div>
      {spatialShadow?.enabled && spatialShadow.overlay &&
        (viewMode === '3d' || viewMode === 'split') ? (
          <SpatialShadowHud spatialShadow={spatialShadow} />
        ) : null}
      {viewMode === '2.5d' && (
        <div className="pascal-lab-workbench__oblique">
          <MaterialObliqueCanvas
            aggregates={aggregates}
            shapes={shapes}
            showSites={showSites}
            showMaterialLabels={showMaterialLabels}
            materialTransferRoutes={
              showMaterialTransfers ? materialTransferOverlayRoutes : []
            }
            selectedMaterialIds={selectedMaterialIds}
            highlightedMaterialIds={highlightedMaterialIds}
            onSelectionChange={(materialIds) => {
              reportSelectionChange(
                materialIds,
                materialIdsToSceneObjectIds(
                  materialSceneSelectionIndex,
                  materialIds
                )
              )
            }}
          />
        </div>
      )}
    </div>
  )
}

function SpatialShadowHud({
  spatialShadow
}: {
  spatialShadow: NonNullable<PascalLabWorkbenchProps['spatialShadow']>
}): React.JSX.Element | null {
  const overlay = spatialShadow.overlay
  if (!overlay) return null
  const collisionLabel = overlay.collisionStatus === 'proxy-mesh-contact'
    ? '当前帧：代理网格接触'
    : overlay.collisionStatus === 'broad-phase-overlap-unresolved'
      ? '当前帧：宽相重叠，待精检'
      : '当前帧：采样分离'
  return (
    <aside
      className="pascal-spatial-shadow-hud"
      aria-label="空间约束 Shadow 播放与证据"
      data-testid="spatial-shadow-hud"
      data-spatial-registration-qualified={String(
        overlay.registrationQualified
      )}
      data-spatial-decision={overlay.decision}
      data-spatial-effect={overlay.effect}
      data-spatial-collision-status={overlay.collisionStatus}
    >
      <div className="pascal-spatial-shadow-hud__boundary" role="alert">
        <strong>候选配准 · 未获得刚体资格</strong>
        <span>仅作 Shadow 查看；decision=unknown · effect=none</span>
      </div>
      <div className="pascal-spatial-shadow-hud__readout">
        <strong>{collisionLabel}</strong>
        <span>
          L1 球/胶囊扫掠 {overlay.l1Capsules.length} 段
          {' · '}L2 环境组件代理作为精检参考
        </span>
        <span>
          最近 AABB 距离下界 {overlay.minimumClearanceM.toFixed(4)} m
          {' · '}Segment #{overlay.segmentIndex + 1} / Frame #{overlay.frameIndex}
        </span>
        {overlay.firstContactTimeS != null && overlay.firstContactTargetPositionM ? (
          <code>
            首次代理接触 {overlay.firstContactTimeS.toFixed(3)} s · 约束坐标 [
            {overlay.firstContactTargetPositionM.map(value => value.toFixed(3)).join(', ')}] m
          </code>
        ) : null}
      </div>
      <div className="pascal-spatial-shadow-hud__controls">
        <button
          type="button"
          onClick={spatialShadow.onPlaybackToggle}
          aria-pressed={spatialShadow.playing}
        >
          {spatialShadow.playing ? '暂停' : '播放'}
        </button>
        <input
          type="range"
          min="0"
          max={overlay.durationS}
          step="0.01"
          value={overlay.currentTimeS}
          aria-label="3D 空间约束轨迹时间"
          onChange={event => spatialShadow.onTimeChange(
            Number(event.currentTarget.value)
          )}
        />
        <span>
          {overlay.currentTimeS.toFixed(2)} / {overlay.durationS.toFixed(2)} s
        </span>
        {spatialShadow.onReload ? (
          <button type="button" onClick={spatialShadow.onReload}>重新读取</button>
        ) : null}
      </div>
    </aside>
  )
}

function sameIds(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}
