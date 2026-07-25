import { emitter } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  PascalEditorHost,
  type SceneGraph
} from '@unilab/pascal-host'
import {
  useCallback,
  useMemo,
  useRef,
  useState
} from 'react'

import type {
  LabMaterialNode,
  MaterialNodeUpdate
} from './material'
import {
  materialNodesToSceneGraph,
  sceneGraphToMaterialUpdates
} from './materialSceneBridge'
import {
  configureLabModelRuntime,
  type LabModelRuntime
} from './modelRuntime'
import { preparePascalLabPlugin } from './plugin'
import {
  isLabDeviceNode,
  isLabTableNode
} from './schema'

export interface PascalLabWorkbenchProps {
  materialNodes: readonly LabMaterialNode[]
  projectId?: string
  modelRuntime?: LabModelRuntime
  onMaterialUpdates?: (updates: readonly MaterialNodeUpdate[]) => void
  onSelectionChange?: (
    materialIds: readonly string[],
    sceneObjectIds: readonly string[]
  ) => void
}

export function PascalLabWorkbench({
  materialNodes,
  projectId = 'unilab-local-scene',
  modelRuntime,
  onMaterialUpdates,
  onSelectionChange
}: PascalLabWorkbenchProps): React.JSX.Element {
  const initialSceneRef = useRef<SceneGraph | null>(null)
  initialSceneRef.current ??= materialNodesToSceneGraph(materialNodes)
  const [saveStatus, setSaveStatus] = useState<
    'saved' | 'dirty' | 'saving'
  >('saved')

  const prepare = useCallback(async () => {
    if (modelRuntime) configureLabModelRuntime(modelRuntime)
    await preparePascalLabPlugin()
  }, [modelRuntime])

  const handleSave = useCallback(
    async (scene: SceneGraph) => {
      setSaveStatus('saving')
      const updates = sceneGraphToMaterialUpdates(scene)
      onMaterialUpdates?.(updates)
      setSaveStatus('saved')
    },
    [onMaterialUpdates]
  )

  const handleSelectionChange = useCallback(
    (sceneObjectIds: readonly string[]) => {
      const scene = initialSceneRef.current
      if (!scene) return
      const materialIds = sceneObjectIds.flatMap((id) => {
        const node = scene.nodes[id]
        return isLabDeviceNode(node) || isLabTableNode(node)
          ? [node.materialNodeId]
          : []
      })
      onSelectionChange?.(materialIds, sceneObjectIds)
    },
    [onSelectionChange]
  )

  const statusLabel = useMemo(() => {
    if (saveStatus === 'saving') return '正在保存'
    if (saveStatus === 'dirty') return '有未保存修改'
    return `${materialNodes.length} 个物料 · 已保存`
  }, [materialNodes.length, saveStatus])

  const toolbar = (
    <div className="pascal-lab-toolbar">
      <span className="pascal-lab-toolbar__title">实验室 3D</span>
      <span className="pascal-lab-toolbar__status">{statusLabel}</span>
      <div className="pascal-lab-toolbar__actions">
        <button
          type="button"
          className="pascal-lab-toolbar__button"
          onClick={() => {
            useViewer.getState().setCameraMode('orthographic')
            emitter.emit('camera-controls:fit-scene', {} as never)
          }}
        >
          顶视图
        </button>
        <button
          type="button"
          className="pascal-lab-toolbar__button"
          onClick={() => {
            useViewer.getState().setCameraMode('perspective')
            emitter.emit('camera-controls:fit-scene', {} as never)
          }}
        >
          适配场景
        </button>
      </div>
    </div>
  )

  return (
    <PascalEditorHost
      scene={initialSceneRef.current}
      projectId={projectId}
      prepare={prepare}
      toolbar={toolbar}
      onDirty={() => setSaveStatus('dirty')}
      onSave={handleSave}
      onSelectionChange={handleSelectionChange}
    />
  )
}
