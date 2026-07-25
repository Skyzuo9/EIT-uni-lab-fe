import {
  Editor,
  type EditorProps,
  type SceneGraph,
  useViewer
} from '@pascal-app/editor'
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
  toolbar,
  editorProps
}: PascalEditorHostProps): React.JSX.Element {
  const sceneRef = useRef(scene)
  const onSaveRef = useRef(onSave)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const [isPrepared, setIsPrepared] = useState(!prepare)
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

  const loadScene = useCallback(async () => sceneRef.current, [])
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
    <div className="pascal-editor-host">
      {toolbar}
      <div className={toolbar ? 'pascal-lab-editor' : 'h-full'}>
        <Editor
          {...editorProps}
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
