import {
  Editor,
  type EditorProps,
  type SceneGraph,
  useScene,
  useViewer
} from '@pascal-app/editor'
import { clearSceneHistory } from '@pascal-app/core'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'

export interface PascalEditorHostProps {
  scene: SceneGraph
  projectId?: string
  prepare?: () => Promise<void> | void
  onDirty?: () => void
  onSave?: (scene: SceneGraph) => Promise<void> | void
  onSelectionChange?: (sceneObjectIds: readonly string[]) => void
  readOnly?: boolean
  toolbar?: ReactNode
  editorProps?: Omit<
    EditorProps,
    'layoutVersion' | 'onDirty' | 'onLoad' | 'onSave' | 'projectId'
  >
}

/**
 * Vite/React host for the official Pascal editor. All Uni-Lab-specific node
 * registration stays outside this package and is injected through `prepare`.
 */
export function PascalEditorHost({
  scene,
  projectId,
  prepare,
  onDirty,
  onSave,
  onSelectionChange,
  readOnly = false,
  toolbar,
  editorProps
}: PascalEditorHostProps): React.JSX.Element {
  const sceneRef = useRef(scene)
  const onSaveRef = useRef(onSave)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const [isPrepared, setIsPrepared] = useState(!prepare)
  const [hasLoadedScene, setHasLoadedScene] = useState(false)
  const [prepareError, setPrepareError] = useState<Error | null>(null)

  sceneRef.current = scene
  onSaveRef.current = onSave
  onSelectionChangeRef.current = onSelectionChange

  useEffect(() => {
    if (!prepare) return

    let cancelled = false
    Promise.resolve(prepare())
      .then(() => {
        if (!cancelled) setIsPrepared(true)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setPrepareError(
          cause instanceof Error
            ? cause
            : new Error('Pascal plugin preparation failed')
        )
      })

    return () => {
      cancelled = true
    }
  }, [prepare])

  useEffect(() => {
    return useViewer.subscribe((state, previousState) => {
      const selectedIds = state.selection.selectedIds
      if (selectedIds === previousState.selection.selectedIds) return
      onSelectionChangeRef.current?.(selectedIds)
    })
  }, [])

  useEffect(() => {
    if (!isPrepared) return
    useScene.getState().setReadOnly(readOnly)
    return () => useScene.getState().setReadOnly(false)
  }, [isPrepared, readOnly])

  useEffect(() => {
    if (!isPrepared || !hasLoadedScene) return
    const state = useScene.getState()
    const extra = {
      collections: scene.collections,
      materials: scene.materials,
      installedPlugins: scene.installedPlugins,
      hasExplicitPluginInstallState:
        scene.installedPlugins !== undefined
    } as Parameters<typeof state.setScene>[2]
    state.setScene(
      scene.nodes as Parameters<typeof state.setScene>[0],
      scene.rootNodeIds as Parameters<typeof state.setScene>[1],
      extra
    )
    clearSceneHistory()

    const selectedIds = useViewer.getState().selection.selectedIds
    if (selectedIds.some((id) => !(id in scene.nodes))) {
      useViewer.getState().resetSelection()
    }
  }, [hasLoadedScene, isPrepared, scene])

  const loadScene = useCallback(async () => {
    const initialScene = sceneRef.current
    requestAnimationFrame(() => setHasLoadedScene(true))
    return initialScene
  }, [])
  const saveScene = useCallback(async (nextScene: SceneGraph) => {
    await onSaveRef.current?.(nextScene)
  }, [])

  if (prepareError) {
    return (
      <div className="panel">
        <div className="material__error">
          3D 插件初始化失败：{prepareError.message}
        </div>
      </div>
    )
  }

  if (!isPrepared) {
    return <div className="app-loading">正在加载 Pascal Editor…</div>
  }

  return (
    <div
      className={`pascal-editor-host${
        readOnly ? ' pascal-editor-host--read-only' : ''
      }`}
    >
      {toolbar}
      <div className={toolbar ? 'pascal-lab-editor' : 'h-full'}>
        <Editor
          {...editorProps}
          isVersionPreviewMode={readOnly}
          layoutVersion="v1"
          onDirty={onDirty}
          onLoad={loadScene}
          onSave={saveScene}
          projectId={projectId}
        />
      </div>
    </div>
  )
}
