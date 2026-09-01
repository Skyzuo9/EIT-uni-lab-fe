import {
  inspectMaterialSceneReadiness,
  MaterialCapabilityNotice,
  readStoredMaterialViewportState,
  UnifiedMaterialViewport,
  useMaterialStore,
  useMaterialStoreApi,
  writeStoredMaterialViewportState,
  type MaterialAggregate,
  type MaterialViewportState,
  type MaterialWorkbenchViewportProps
} from '@unilab/material'
import type {
  MaterialSceneSourceIdentity,
  MaterialSceneMove,
  MaterialTransferSceneRoute
} from '@unilab/pascal-lab-plugin'
import { ensurePascalRendererDefaults } from '@unilab/pascal-host'
import {
  projectSpatialShadowToPascal,
  type SpatialDiagnosticsStatus,
  type SpatialShadowSnapshot,
  useSpatialShadowPlayback
} from '@unilab/spatial-diagnostics'
import {
  activateSceneRuntimeScope,
  clearSpatialJointStateFrame,
  publishJointStateFrame,
  publishSpatialJointStateFrame,
  replaceJointStateSnapshot,
  type JointStateFrameInput
} from '@unilab/scene-runtime'
import type {
  DeviceJointStateFrame,
  RealtimeService
} from '@unilab/services'
import type { WorkflowPanelRuntimeProjection } from '@unilab/workflow-editor'
import { toCanvas } from 'html-to-image'
import * as React from 'react'
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  MATERIAL_RENDERER_CONTRACT,
  type MaterialRendererOptions,
  type MaterialRendererLayoutOverride,
  type MaterialRendererRequest,
  type MaterialRendererResponse
} from '../common/workbench-session-protocol'
import { currentInitialSpatialShadowState } from './workbench-material-projection'
import type { WorkbenchSessionClientImpl } from './workbench-session-client'
import { useWorkbenchMaterialGraphLoad } from './workbench-material-graph-load'
import { resolveWorkbenchModelUrl } from './workbench-model-url'
import {
  WorkbenchMaterialSceneState,
  WorkbenchMaterialShapeFallbackNotice
} from './workbench-material-scene-state'
import {
  alignSpatialShadowRobotBase,
  resolveSpatialShadowRobotBinding,
  spatialShadowFrameSequence
} from './workbench-spatial-shadow-runtime'

ensurePascalRendererDefaults()

const PascalLabWorkbench = React.lazy(async () => {
  const module = await import('@unilab/pascal-lab-plugin')
  return { default: module.PascalLabWorkbench }
})

/** 在 Workbench 中组合物料图存储与 Pascal 视口。 */
export function WorkbenchMaterialViewport({
  backendUrl,
  realtime,
  realtimeEnabled,
  runtimeScopeId,
  sourceIdentity,
  sessionClient,
  runtimeProjection,
  selectedWorkflowNode,
  cameraFocus,
  readStatus,
  moveStatus,
  selectedMaterialIds,
  highlightedMaterialIds,
  onSelectionChange,
  spatialShadow
}: MaterialWorkbenchViewportProps & {
  backendUrl: string
  realtime: RealtimeService
  realtimeEnabled: boolean
  runtimeScopeId: string
  sourceIdentity: MaterialSceneSourceIdentity
  sessionClient: WorkbenchSessionClientImpl
  runtimeProjection: WorkflowPanelRuntimeProjection | null
  selectedWorkflowNode: string | null
  cameraFocus?: 'scene' | 'kinematics'
  spatialShadow: {
    snapshot: SpatialShadowSnapshot | null
    status: SpatialDiagnosticsStatus
    onReload: () => void
  }
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const captureActive = useRef(false)
  const pendingPascalCapture = useRef<{
    resolve(blob: Blob): void
    reject(error: Error): void
    timeout: ReturnType<typeof setTimeout>
    width: number
    height: number
    validating: boolean
    lastError: string | null
  } | null>(null)
  const shadowRobotMaterialId = useRef<string | null>(null)
  const [viewState, setViewState] = useState<MaterialViewportState>(
    readStoredMaterialViewportState
  )
  const [automationOptions, setAutomationOptions] =
    useState<MaterialRendererOptions | null>(null)
  const [automationRevision, setAutomationRevision] = useState(0)
  const [pascalCaptureRequest, setPascalCaptureRequest] = useState<{
    revision: number
    width: number
    height: number
  } | null>(null)
  const [spatialShadowEnabled, setSpatialShadowEnabled] = useState(
    () => currentInitialSpatialShadowState().enabled
  )
  const spatialPlayback = useSpatialShadowPlayback()
  const store = useMaterialStoreApi()
  const aggregatesById = useMaterialStore((state) => state.aggregatesById)
  const shapeLibrary = useMaterialStore((state) => state.shapeLibrary)
  const shapeLibraryState = useMaterialStore(
    (state) => state.shapeLibraryState
  )
  const loadState = useMaterialStore((state) => state.loadState)
  const graphError = useMaterialStore((state) => state.error)
  const aggregates = useMemo(
    () => Object.values(aggregatesById),
    [aggregatesById]
  )
  const displayedViewState = useMemo<MaterialViewportState>(() => ({
    mode: automationOptions?.view ?? viewState.mode,
    showSites: automationOptions?.showSites ?? viewState.showSites,
    showMaterialTransfers:
      automationOptions?.showMaterialTransfers ?? viewState.showMaterialTransfers,
    showMaterialLabels: viewState.showMaterialLabels
  }), [automationOptions, viewState])
  const displayedAggregates = useMemo(() => {
    const adjusted = applyLayoutOverrides(
      aggregates,
      automationOptions?.layoutOverrides ?? []
    )
    const hidden = new Set(automationOptions?.hiddenMaterialIds ?? [])
    return hidden.size === 0
      ? adjusted
      : adjusted.filter(aggregate => !hidden.has(aggregate.material.id))
  }, [aggregates, automationOptions?.hiddenMaterialIds, automationOptions?.layoutOverrides])
  const displayedSelectedMaterialIds =
    automationOptions?.selectedMaterialIds ?? selectedMaterialIds
  const materialTransferRoutes = useMemo<MaterialTransferSceneRoute[]>(
    () => (runtimeProjection?.materialTransferRoutes ?? []).map((route) => ({
      ...route,
      selected: route.workflowNodeUuid === selectedWorkflowNode
    })),
    [runtimeProjection, selectedWorkflowNode]
  )
  const sceneReadiness = useMemo(
    () => inspectMaterialSceneReadiness(aggregates),
    [aggregates]
  )
  const modelRuntime = useMemo(() => ({
    /** 把包内相对模型路径解析到当前 OS 地址。 */
    resolveUrl: (model: { path: string }) =>
      resolveWorkbenchModelUrl(backendUrl, model.path)
  }), [backendUrl])
  const displayedSpatialShadowTimeS =
    automationOptions?.spatialShadowTimeS ?? spatialPlayback.timeS
  const displayedSpatialShadowEnabled =
    automationOptions?.showSpatialShadow ?? spatialShadowEnabled
  const spatialShadowOverlay = useMemo(
    () => spatialShadow.snapshot
      ? projectSpatialShadowToPascal(
          spatialShadow.snapshot,
          displayedSpatialShadowTimeS
        )
      : null,
    [displayedSpatialShadowTimeS, spatialShadow.snapshot]
  )

  useEffect(() => {
    activateSceneRuntimeScope(runtimeScopeId)
    if (!realtimeEnabled) return
    const project = (frame: DeviceJointStateFrame): JointStateFrameInput => ({
      ...frame,
      source: 'live'
    })
    return realtime.subscribeJointState({
      onJointState: frame => publishJointStateFrame(project(frame)),
      onSnapshot: frames => replaceJointStateSnapshot(frames.map(project))
    })
  }, [realtime, realtimeEnabled, runtimeScopeId])

  const shadowRobot = useMemo(
    () => resolveSpatialShadowRobotBinding(displayedAggregates),
    [displayedAggregates]
  )
  const shadowPlaybackFrame = useMemo(() => {
    if (!spatialShadow.snapshot || !spatialShadowOverlay) return null
    return spatialShadow.snapshot.playback.segments
      .find(segment => segment.segment_index === spatialShadowOverlay.segmentIndex)
      ?.frames.find(frame => frame.frame_index === spatialShadowOverlay.frameIndex) ?? null
  }, [spatialShadow.snapshot, spatialShadowOverlay])
  const spatialSceneAggregates = useMemo(
    () => displayedSpatialShadowEnabled && spatialShadow.snapshot && shadowRobot
      ? alignSpatialShadowRobotBase(
          displayedAggregates,
          shadowRobot.materialId,
          spatialShadow.snapshot
        )
      : displayedAggregates,
    [
      displayedAggregates,
      displayedSpatialShadowEnabled,
      shadowRobot,
      spatialShadow.snapshot
    ]
  )

  useEffect(() => {
    const previousMaterialId = shadowRobotMaterialId.current
    if (
      !displayedSpatialShadowEnabled ||
      !spatialShadow.snapshot ||
      !spatialShadowOverlay ||
      !shadowRobot ||
      !shadowPlaybackFrame
    ) {
      if (previousMaterialId) clearSpatialJointStateFrame(previousMaterialId)
      shadowRobotMaterialId.current = null
      return
    }
    if (
      previousMaterialId &&
      previousMaterialId !== shadowRobot.materialId
    ) clearSpatialJointStateFrame(previousMaterialId)
    const jointStates = Object.fromEntries(
      shadowRobot.qualifiedJointNames.map((jointName, index) => [
        jointName,
        shadowPlaybackFrame.joint_positions_rad[index]
      ])
    )
    publishSpatialJointStateFrame({
      materialId: shadowRobot.materialId,
      deviceId: shadowRobot.deviceId,
      topologyDigest: shadowRobot.topologyDigest,
      bootId: `spatial-shadow:${spatialShadow.snapshot.snapshot_digest.slice(0, 24)}`,
      sequence: spatialShadowFrameSequence(
        spatialShadow.snapshot,
        spatialShadowOverlay.segmentIndex,
        spatialShadowOverlay.frameIndex
      ),
      acceptedRef: `spatial-shadow:${spatialShadow.snapshot.snapshot_digest}:${spatialShadowOverlay.segmentIndex}:${spatialShadowOverlay.frameIndex}`,
      observedAt: shadowPlaybackFrame.time_s,
      staleAfterSeconds: shadowRobot.staleAfterSeconds,
      stale: false,
      jointStates,
      source: 'shadow'
    })
    shadowRobotMaterialId.current = shadowRobot.materialId
  }, [
    displayedSpatialShadowEnabled,
    runtimeScopeId,
    shadowPlaybackFrame,
    shadowRobot,
    spatialShadow.snapshot,
    spatialShadowOverlay
  ])

  useEffect(() => () => {
    if (shadowRobotMaterialId.current) {
      clearSpatialJointStateFrame(shadowRobotMaterialId.current)
    }
  }, [])

  const inspectScene = useCallback(async (
    options: MaterialRendererOptions
  ) => {
    const module = await import('@unilab/pascal-lab-plugin')
    const layoutAdjusted = applyLayoutOverrides(
      aggregates,
      options.layoutOverrides ?? []
    )
    const binding = resolveSpatialShadowRobotBinding(layoutAdjusted)
    const adjusted = options.showSpatialShadow && spatialShadow.snapshot && binding
      ? alignSpatialShadowRobotBase(
          layoutAdjusted,
          binding.materialId,
          spatialShadow.snapshot
        )
      : layoutAdjusted
    return module.inspectMaterialAggregateScene(adjusted, {
      viewMode: options.view ?? viewState.mode,
      showSites: options.showSites ?? viewState.showSites,
      showMaterialTransfers:
        options.showMaterialTransfers ?? viewState.showMaterialTransfers,
      selectedMaterialIds: options.selectedMaterialIds ?? selectedMaterialIds,
      hiddenMaterialIds: options.hiddenMaterialIds ?? [],
      sourceIdentity
    })
  }, [
    aggregates,
    selectedMaterialIds,
    sourceIdentity,
    spatialShadow.snapshot,
    viewState
  ])

  const capturePascalScene = useCallback((
    width: number,
    height: number,
    timeoutMs: number
  ): Promise<Blob> => new Promise((resolve, reject) => {
    pendingPascalCapture.current?.reject(
      new Error('新的 3D 截图请求替代了尚未完成的请求')
    )
    if (pendingPascalCapture.current) {
      clearTimeout(pendingPascalCapture.current.timeout)
    }
    const timeout = setTimeout(() => {
      const lastError = pendingPascalCapture.current?.lastError
      pendingPascalCapture.current = null
      setPascalCaptureRequest(null)
      reject(new Error(
        `Pascal 3D 截图在 ${timeoutMs}ms 内未完成${lastError ? `：${lastError}` : ''}`
      ))
    }, timeoutMs)
    pendingPascalCapture.current = {
      resolve,
      reject,
      timeout,
      width,
      height,
      validating: false,
      lastError: null
    }
    setPascalCaptureRequest(current => ({
      revision: (current?.revision ?? 0) + 1,
      width,
      height
    }))
  }), [])

  const handlePascalCaptureReady = useCallback((
    blob: Blob,
    cameraData: {
      position: [number, number, number]
      target: [number, number, number] | null
      type?: 'perspective' | 'orthographic'
      zoom?: number
    }
  ): void => {
    const pending = pendingPascalCapture.current
    if (!pending || pending.validating) return
    pending.validating = true
    void assertVisiblePngCapture(blob, pending.width, pending.height)
      .then(() => {
        if (pendingPascalCapture.current !== pending) return
        pendingPascalCapture.current = null
        clearTimeout(pending.timeout)
        setPascalCaptureRequest(null)
        pending.resolve(blob)
      })
      .catch(error => {
        if (pendingPascalCapture.current !== pending) return
        pending.validating = false
        const message = error instanceof Error ? error.message : String(error)
        pending.lastError = `${message}；相机=${JSON.stringify(cameraData)}`
      })
  }, [])

  const handleRendererRequest = useCallback(async (
    request: MaterialRendererRequest
  ): Promise<MaterialRendererResponse> => {
    if (request.kind === 'reload') {
      store.getState().reset()
      await store.getState().loadGraph()
      return {
        schemaVersion: MATERIAL_RENDERER_CONTRACT,
        requestId: request.requestId,
        ok: true,
        result: { status: 'reloaded' }
      }
    }
    if (request.kind === 'inspect') {
      return {
        schemaVersion: MATERIAL_RENDERER_CONTRACT,
        requestId: request.requestId,
        ok: true,
        result: await inspectScene(request.options)
      }
    }
    if (captureActive.current) {
      return rendererFailure(
        request.requestId,
        'material_renderer_busy',
        '物料画布正在完成另一个截图请求'
      )
    }
    captureActive.current = true
    setAutomationOptions(request.options)
    setAutomationRevision(revision => revision + 1)
    try {
      const root = rootRef.current
      if (!root) throw new Error('物料画布尚未挂载')
      await waitForMaterialScene(
        root,
        request.options.view ?? viewState.mode,
        request.options.timeoutMs ?? 30_000
      )
      const viewport = request.options.viewport
      const previousStyle = root.getAttribute('style')
      if (viewport) {
        // 并排 Workbench 中物料列可能只有百余像素。截图期间把同一 renderer
        // 提升为固定尺寸表面，使 Pascal 真正按请求分辨率重排，而不是放大小图。
        root.style.position = 'fixed'
        root.style.inset = '0 auto auto 0'
        root.style.zIndex = '2147483000'
        root.style.flex = 'none'
        root.style.background = '#ffffff'
        root.style.width = `${viewport.width}px`
        root.style.height = `${viewport.height}px`
        root.style.maxWidth = 'none'
        await stableAnimationFrames(5)
      }
      try {
        const view = request.options.view ?? viewState.mode
        const requestedWidth = viewport?.width ?? Math.round(root.clientWidth)
        const requestedHeight = viewport?.height ?? Math.round(root.clientHeight)
        const image = view === '3d'
          ? await capturePascalScene(
              requestedWidth,
              requestedHeight,
              Math.max(1_000, (request.options.timeoutMs ?? 30_000) - 1_000)
            ).then(async blob => {
              await assertVisiblePngCapture(
                blob,
                requestedWidth,
                requestedHeight
              )
              return {
                base64: arrayBufferToBase64(await blob.arrayBuffer()),
                width: requestedWidth,
                height: requestedHeight
              }
            })
          : await captureMaterialDom(root, view, request.options).then(canvas => ({
              base64: canvas.toDataURL('image/png').split(',', 2)[1] ?? '',
              width: canvas.width,
              height: canvas.height
            }))
        const scene = await inspectScene(request.options)
        return {
          schemaVersion: MATERIAL_RENDERER_CONTRACT,
          requestId: request.requestId,
          ok: true,
          result: {
            schemaVersion: 'unilab-material-capture/v1',
            rendererVersion: 'unilab-workbench/0.1.0',
            scene,
            image: {
              mimeType: 'image/png',
              width: image.width,
              height: image.height,
              base64: image.base64
            }
          }
        }
      } finally {
        if (previousStyle == null) root.removeAttribute('style')
        else root.setAttribute('style', previousStyle)
      }
    } catch (cause) {
      return rendererFailure(
        request.requestId,
        'material_capture_failed',
        cause instanceof Error ? cause.message : String(cause)
      )
    } finally {
      setAutomationOptions(null)
      captureActive.current = false
    }
  }, [capturePascalScene, inspectScene, store, viewState.mode])

  useEffect(() => {
    const registration = sessionClient.setMaterialRendererHandler(
      handleRendererRequest
    )
    return () => registration.dispose()
  }, [handleRendererRequest, sessionClient])

  useWorkbenchMaterialGraphLoad(store, readStatus.available, loadState)

  /** 依次向 OS 提交物料移动，保留存储端的修订冲突语义。 */
  const applyMoves = useCallback(async (
    moves: readonly MaterialSceneMove[]
  ): Promise<void> => {
    for (const move of moves) {
      await store.getState().move(move.materialId, move.placement)
    }
  }, [store])

  /** 清理失败状态并重新读取当前调度权威的物料图。 */
  const retryGraph = useCallback((): void => {
    store.getState().reset()
    void store.getState().loadGraph()
  }, [store])

  if (!readStatus.available) {
    return <MaterialCapabilityNotice title="物料场景不可用" status={readStatus} />
  }
  if (loadState === 'idle' || loadState === 'loading') {
    return <div className="unilab-workbench-material-loading">正在加载物料场景…</div>
  }
  if (loadState === 'error') {
    return (
      <WorkbenchMaterialSceneState
        kind="error"
        error={graphError}
        onRetry={retryGraph}
      />
    )
  }
  if (sceneReadiness.state === 'empty') {
    return <WorkbenchMaterialSceneState kind="empty" readiness={sceneReadiness} />
  }
  if (sceneReadiness.state === 'list-only') {
    return (
      <WorkbenchMaterialSceneState
        kind="list-only"
        readiness={sceneReadiness}
      />
    )
  }

  return (
    <div
      ref={rootRef}
      className="unilab-workbench-material-scene"
      data-material-renderer-ready="true"
    >
      {shapeLibraryState === 'unavailable' && (
        displayedViewState.mode === '2.5d' || displayedViewState.mode === 'split'
      ) ? (
        <WorkbenchMaterialShapeFallbackNotice />
      ) : null}
      <UnifiedMaterialViewport
        viewState={displayedViewState}
        onViewStateChange={(next) => {
          setViewState(next)
          writeStoredMaterialViewportState(next)
        }}
        renderView={(viewMode, {
          showSites,
          showMaterialTransfers,
          showMaterialLabels
        }) => (
          <Suspense
            fallback={(
              <div className="unilab-workbench-material-loading">
                正在加载 {viewMode === '3d' || viewMode === 'split'
                  ? '3D'
                  : viewMode} 物料视图…
              </div>
            )}
          >
            <PascalLabWorkbench
              aggregates={spatialSceneAggregates}
              shapes={shapeLibrary}
              showSites={showSites}
              showMaterialLabels={showMaterialLabels}
              showMaterialTransfers={showMaterialTransfers}
              materialTransferRoutes={materialTransferRoutes}
              materialTransferProjectionError={null}
              viewMode={viewMode}
              cameraPreset={automationOptions?.cameraPreset}
              cameraRequestRevision={automationRevision}
              cameraFocus={cameraFocus}
              captureRequest={pascalCaptureRequest}
              onCaptureReady={handlePascalCaptureReady}
              projectId={`unilab-workbench-${new URL(backendUrl).port}`}
              editable={moveStatus.available}
              selectedMaterialIds={displayedSelectedMaterialIds}
              highlightedMaterialIds={highlightedMaterialIds}
              modelRuntime={modelRuntime}
              onMaterialMoves={(moves) => void applyMoves(moves)}
              onSelectionChange={(materialIds) => onSelectionChange?.(materialIds)}
              spatialShadow={{
                phase: spatialShadow.status.phase,
                message: spatialShadow.status.message,
                enabled: displayedSpatialShadowEnabled,
                playing: spatialPlayback.playing,
                overlay: spatialShadowOverlay,
                onToggle: () => {
                  setSpatialShadowEnabled(current => {
                    if (current && spatialPlayback.playing) spatialPlayback.toggle()
                    return !current
                  })
                },
                onPlaybackToggle: spatialPlayback.toggle,
                onTimeChange: timeS => {
                  if (spatialPlayback.playing) spatialPlayback.toggle()
                  spatialPlayback.seek(timeS)
                },
                onReload: spatialShadow.onReload
              }}
            />
          </Suspense>
        )}
      />
    </div>
  )
}

function applyLayoutOverrides(
  aggregates: readonly MaterialAggregate[],
  overrides: readonly MaterialRendererLayoutOverride[]
): MaterialAggregate[] {
  if (overrides.length === 0) return [...aggregates]
  const bySourceId = new Map(overrides.map(item => [item.sourceNodeId, item]))
  return aggregates.map(aggregate => {
    const sourceNodeId = aggregate.material.config.sourceIdentity
    const override = typeof sourceNodeId === 'string'
      ? bySourceId.get(sourceNodeId)
      : undefined
    if (!override) return aggregate
    const pose = aggregate.placement.kind === 'world'
      ? aggregate.placement.pose
      : aggregate.placement.kind === 'parent'
        ? aggregate.placement.localPose
        : null
    const placement = pose == null
      ? aggregate.placement
      : aggregate.placement.kind === 'world'
        ? {
            ...aggregate.placement,
            pose: {
              positionMm: override.positionMm ?? pose.positionMm,
              rotationDegXYZ: override.rotationDegXYZ ?? pose.rotationDegXYZ
            }
          }
        : {
            ...aggregate.placement,
            localPose: {
              positionMm: override.positionMm ?? pose.positionMm,
              rotationDegXYZ: override.rotationDegXYZ ?? pose.rotationDegXYZ
            }
          }
    const rendering = aggregate.material.config.rendering
    const config = override.assetRef
      ? {
          ...aggregate.material.config,
          rendering: {
            ...(rendering && typeof rendering === 'object' ? rendering : {}),
            model: override.assetRef
          }
        }
      : aggregate.material.config
    return {
      ...aggregate,
      material: { ...aggregate.material, config },
      placement
    }
  })
}

function rendererFailure(
  requestId: string,
  code: string,
  message: string
): MaterialRendererResponse {
  return {
    schemaVersion: MATERIAL_RENDERER_CONTRACT,
    requestId,
    ok: false,
    error: { code, message }
  }
}

async function waitForMaterialScene(
  root: HTMLElement,
  view: MaterialViewportState['mode'],
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const viewport = root.querySelector<HTMLElement>(
      '.lab-unified-viewport'
    )
    const pascal = root.querySelector<HTMLElement>('[data-pascal-scene-ready]')
    if (
      viewport?.dataset.labViewMode === view &&
      pascal?.dataset.pascalSceneReady === 'true'
    ) break
    await stableAnimationFrames(1)
  }
  if (Date.now() >= deadline) {
    throw new Error(`物料场景在 ${timeoutMs}ms 内未进入 ready`)
  }
  if (globalThis.document?.fonts) await globalThis.document.fonts.ready
  await waitForImages(root, deadline)
  const module = await import('@unilab/pascal-lab-plugin')
  let previousRevision = -1
  let stable = 0
  while (Date.now() < deadline && stable < 3) {
    const runtime = module.readMaterialSceneRuntimeState()
    const failures = Object.entries(runtime.modelFailures)
    if (failures.length > 0) {
      throw new Error(`3D 模型加载失败：${failures.map(
        ([identity, message]) => `${identity}: ${message}`
      ).join('；')}`)
    }
    stable = runtime.geometryRevision === previousRevision ? stable + 1 : 0
    previousRevision = runtime.geometryRevision
    await stableAnimationFrames(1)
  }
  if (stable < 3) throw new Error('物料场景几何在超时前仍未稳定')
}

async function waitForImages(root: HTMLElement, deadline: number): Promise<void> {
  const images = [...root.querySelectorAll('img')]
  for (const image of images) {
    while (!image.complete && Date.now() < deadline) {
      await stableAnimationFrames(1)
    }
    if (!image.complete || (image.src && image.naturalWidth === 0)) {
      throw new Error(`画布图片加载失败：${image.currentSrc || image.src}`)
    }
  }
}

function stableAnimationFrames(count: number): Promise<void> {
  return Array.from({ length: count }).reduce<Promise<void>>(
    chain => chain.then(nextVisualTick),
    Promise.resolve()
  )
}

function nextVisualTick(): Promise<void> {
  return new Promise(resolve => {
    let settled = false
    let frame = 0
    const complete = (): void => {
      if (settled) return
      settled = true
      if (frame) cancelAnimationFrame(frame)
      clearTimeout(timeout)
      resolve()
    }
    const timeout = setTimeout(complete, 34)
    frame = requestAnimationFrame(complete)
  })
}

async function captureMaterialDom(
  root: HTMLElement,
  view: Exclude<MaterialViewportState['mode'], '3d'>,
  options: MaterialRendererOptions
): Promise<HTMLCanvasElement> {
  const selector = view === '2.5d'
    ? '.pascal-lab-workbench__oblique'
    : view === '2d'
      ? '.material-canvas.is-floorplan-overlay'
      : '.pascal-editor-host'
  const target = root.querySelector<HTMLElement>(selector)
  if (!target) throw new Error(`${view} 物料画布尚未挂载`)
  const rect = target.getBoundingClientRect()
  const width = options.viewport?.width ?? Math.round(rect.width)
  const height = options.viewport?.height ?? Math.round(rect.height)
  const scale = options.viewport?.pixelRatio ?? 1
  const restoreSvgPresentation = inlineSvgPresentation(target)
  try {
    return await toCanvas(target, {
      width,
      height,
      canvasWidth: Math.round(width * scale),
      canvasHeight: Math.round(height * scale),
      pixelRatio: 1,
      backgroundColor: '#ffffff',
      cacheBust: true,
      skipAutoScale: true
    })
  } finally {
    restoreSvgPresentation()
  }
}

async function assertVisiblePngCapture(
  blob: Blob,
  expectedWidth: number,
  expectedHeight: number
): Promise<void> {
  if (blob.type && blob.type !== 'image/png') {
    throw new Error(`Pascal 3D 截图格式非法：${blob.type}`)
  }
  if (blob.size < 256) throw new Error('Pascal 3D 截图为空或过小')
  const bitmap = await createImageBitmap(blob)
  try {
    if (bitmap.width !== expectedWidth || bitmap.height !== expectedHeight) {
      throw new Error(
        `Pascal 3D 截图尺寸错误：${bitmap.width}x${bitmap.height}`
      )
    }
    const sampleWidth = Math.min(bitmap.width, 96)
    const sampleHeight = Math.min(bitmap.height, 96)
    const canvas = document.createElement('canvas')
    canvas.width = sampleWidth
    canvas.height = sampleHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('浏览器不支持 3D 截图像素验收')
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight)
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data
    let visible = 0
    let nonBlack = 0
    let minimumLuminance = Number.POSITIVE_INFINITY
    let maximumLuminance = Number.NEGATIVE_INFINITY
    let minimumRed = 255
    let maximumRed = 0
    let minimumGreen = 255
    let maximumGreen = 0
    let minimumBlue = 255
    let maximumBlue = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 16) continue
      visible += 1
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 24) {
        nonBlack += 1
      }
      const red = pixels[index]
      const green = pixels[index + 1]
      const blue = pixels[index + 2]
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
      minimumLuminance = Math.min(minimumLuminance, luminance)
      maximumLuminance = Math.max(maximumLuminance, luminance)
      minimumRed = Math.min(minimumRed, red)
      maximumRed = Math.max(maximumRed, red)
      minimumGreen = Math.min(minimumGreen, green)
      maximumGreen = Math.max(maximumGreen, green)
      minimumBlue = Math.min(minimumBlue, blue)
      maximumBlue = Math.max(maximumBlue, blue)
    }
    const total = sampleWidth * sampleHeight
    if (visible / total < 0.05 || nonBlack / total < 0.01) {
      throw new Error('Pascal 3D 截图像素为空或全黑，已拒绝验收')
    }
    const luminanceRange = maximumLuminance - minimumLuminance
    const channelRange = Math.max(
      maximumRed - minimumRed,
      maximumGreen - minimumGreen,
      maximumBlue - minimumBlue
    )
    if (luminanceRange < 8 && channelRange < 8) {
      throw new Error('Pascal 3D 截图只有单色背景，未发现可验收场景')
    }
  } finally {
    bitmap.close()
  }
}

const SVG_PRESENTATION_PROPERTIES = [
  'color',
  'display',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'fill-rule',
  'flood-color',
  'flood-opacity',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'marker-end',
  'marker-mid',
  'marker-start',
  'opacity',
  'paint-order',
  'shape-rendering',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-rendering',
  'transform',
  'transform-origin',
  'visibility'
] as const

/**
 * SVG presentation rules can depend on a CSS-module scope outside the capture
 * target. Inline their computed values so the renderer clone keeps the exact
 * live material colours without retaining or parsing the whole Workbench DOM.
 */
function inlineSvgPresentation(root: HTMLElement): () => void {
  const elements = [...root.querySelectorAll<SVGElement>('svg, svg *')]
  const previousStyles = elements.map(element => element.getAttribute('style'))
  elements.forEach(element => {
    const computed = getComputedStyle(element)
    for (const property of SVG_PRESENTATION_PROPERTIES) {
      const value = computed.getPropertyValue(property)
      if (value) element.style.setProperty(property, value)
    }
  })
  return () => {
    elements.forEach((element, index) => {
      const previous = previousStyles[index]
      if (previous == null) element.removeAttribute('style')
      else element.setAttribute('style', previous)
    })
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return globalThis.btoa(binary)
}
