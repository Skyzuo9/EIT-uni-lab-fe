import { PascalEditorHost } from '@unilab/pascal-host'
import {
  isLabDeviceNode,
  preparePascalLabPlugin
} from '@unilab/pascal-lab-plugin'
import {
  activateSceneRuntimeScope,
  publishJointStateFrame,
  replaceJointStateSnapshot,
  sceneRuntimeScopeId,
  type JointStateFrameInput
} from '@unilab/scene-runtime'
import {
  createRealtimeService,
  type DeviceJointStateFrame
} from '@unilab/services'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { supportsWebGl } from '../lab-workbench/webGlCapability'
import {
  KINEMATIC_PREVIEW_BACKEND,
  KINEMATIC_PREVIEW_CATALOG_URL,
  parseKinematicPreviewCatalog,
  projectKinematicPreviewScene,
  type KinematicPreviewDescriptor
} from './descriptor'
import styles from './KinematicPreviewPage.module.scss'

type RunState = 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled'

/**
 * Mac 本地 kinematic-preview：复用正式 Pascal renderer 与设备遥测 SSE。
 * 页面只调用受限预览端点，不拥有硬件执行、MoveIt 或空间互锁许可。
 */
export function KinematicPreviewPage(): React.JSX.Element {
  const [descriptors, setDescriptors] = useState<readonly KinematicPreviewDescriptor[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(false)
  const [fitSceneRevision, setFitSceneRevision] = useState(1)
  const [runState, setRunState] = useState<RunState>('idle')
  const [streamState, setStreamState] = useState<'connecting' | 'live' | 'error'>(
    'connecting'
  )
  const [lastSequence, setLastSequence] = useState<number | null>(null)
  const descriptor = useMemo(
    () => descriptors.find(item => item.deviceId === activeDeviceId) ?? null,
    [activeDeviceId, descriptors]
  )

  useEffect(() => {
    let cancelled = false
    void fetch(KINEMATIC_PREVIEW_CATALOG_URL)
      .then(async response => {
        if (!response.ok) {
          throw new Error(`descriptor HTTP ${response.status}`)
        }
        return response.json() as Promise<unknown>
      })
      .then(value => {
        if (cancelled) return
        const catalog = parseKinematicPreviewCatalog(value)
        setDescriptors(catalog.robots)
        setActiveDeviceId(current => current ?? catalog.robots[0]?.deviceId ?? null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSelected(false)
    setRunState('idle')
    setLastSequence(null)
  }, [activeDeviceId])

  useEffect(() => {
    const endpoint = `${window.location.origin}${KINEMATIC_PREVIEW_BACKEND}`
    const realtime = createRealtimeService({
      id: 'local-python',
      name: 'Mac 机器人 SourceRelease 运动预览',
      protocol: 'unilab/v1',
      apiUrl: endpoint,
      realtimeUrl: endpoint,
      assetUrl: endpoint,
      auth: 'none',
      serverKind: 'edge',
      workspaceMode: 'singleton'
    })
    activateSceneRuntimeScope(
      sceneRuntimeScopeId('robot-source-release-kinematic-preview', endpoint)
    )
    const project = (frame: DeviceJointStateFrame): JointStateFrameInput => ({
      ...frame,
      source: 'live'
    })
    const close = realtime.subscribeJointState({
      onOpen: () => setStreamState('live'),
      onError: () => setStreamState('error'),
      onJointState: frame => {
        publishJointStateFrame(project(frame))
        if (frame.deviceId === activeDeviceId) setLastSequence(frame.sequence)
      },
      onSnapshot: frames => {
        replaceJointStateSnapshot(frames.map(project))
        setLastSequence(
          frames.filter(frame => frame.deviceId === activeDeviceId).at(-1)?.sequence ?? null
        )
      }
    })
    return () => {
      close()
      realtime.dispose()
    }
  }, [activeDeviceId])

  useEffect(() => {
    if (runState !== 'running' || !activeDeviceId) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void fetch(
        `${KINEMATIC_PREVIEW_BACKEND}/api/v1/kinematic-preview/robots/${encodeURIComponent(activeDeviceId)}/status`
      )
        .then(async response => response.json() as Promise<unknown>)
        .then(value => {
          if (cancelled || !isRecord(value)) return
          const status = value.status
          if (
            status === 'idle' || status === 'running' || status === 'succeeded' ||
            status === 'failed' || status === 'cancelled'
          ) {
            setRunState(status)
          }
        })
        .catch(() => setRunState('failed'))
    }, 200)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeDeviceId, runState])

  const scene = useMemo(
    () => descriptor
      ? projectKinematicPreviewScene(descriptor, fitSceneRevision)
      : null,
    [descriptor, fitSceneRevision]
  )

  const prepare = useCallback(async () => {
    await preparePascalLabPlugin()
  }, [])

  const handleSelectionChange = useCallback((sceneObjectIds: readonly string[]) => {
    if (!scene) return
    setSelected(sceneObjectIds.some(id => isLabDeviceNode(scene.nodes[id])))
  }, [scene])

  const runWorkflow = useCallback(async (workflowId: string) => {
    if (!activeDeviceId) throw new Error('尚未选择机器人')
    setError(null)
    const response = await fetch(
      `${KINEMATIC_PREVIEW_BACKEND}/api/v1/kinematic-preview/robots/${encodeURIComponent(activeDeviceId)}/workflows/${encodeURIComponent(workflowId)}/runs`,
      { method: 'POST' }
    )
    const payload = await response.json() as unknown
    if (!response.ok) {
      throw new Error(readError(payload, `预览启动失败（HTTP ${response.status}）`))
    }
    setRunState('running')
  }, [activeDeviceId])

  const stopWorkflow = useCallback(async () => {
    if (!activeDeviceId) throw new Error('尚未选择机器人')
    const response = await fetch(
      `${KINEMATIC_PREVIEW_BACKEND}/api/v1/kinematic-preview/robots/${encodeURIComponent(activeDeviceId)}/runs/current:cancel`,
      { method: 'POST' }
    )
    if (!response.ok) throw new Error(`预览停止失败（HTTP ${response.status}）`)
    setRunState('cancelled')
  }, [activeDeviceId])

  if (!supportsWebGl()) {
    return <main className={styles.page}><Banner /><p className={styles.error}>当前浏览器未启用 WebGL。</p></main>
  }
  if (error || !descriptor || !scene) {
    return (
      <main className={styles.page}>
        <Banner />
        <p className={error ? styles.error : styles.status} data-testid="kinematic-preview-state">
          {error ?? '正在校验 CR5 / FR5 SourceRelease Provider 模型…'}
        </p>
      </main>
    )
  }

  return (
    <main className={styles.page} data-testid="kinematic-preview-page">
      <Banner />
      <div className={styles.body}>
        <section className={styles.viewport} aria-label={`${descriptor.displayName} 三维运动预览`}>
          <div className="pascal-lab-workbench">
            <div className="pascal-lab-workbench__native">
              <PascalEditorHost
                scene={scene}
                projectId="asset-pipeline-kinematic-preview"
                prepare={prepare}
                readOnly
                editorViewMode="3d"
                sceneTheme="studio"
                showGrid
                suppressSelectionAfterPointerDrag
                toolbar={
                  <div className="pascal-lab-toolbar">
                    <span className="pascal-lab-toolbar__title">
                      {descriptor.displayName} · kinematic-preview
                    </span>
                    <span className="pascal-lab-toolbar__status">
                      SSE {streamState} · run {runState}
                    </span>
                    <div className="pascal-lab-toolbar__actions">
                      <button
                        type="button"
                        className="pascal-lab-toolbar__button"
                        onClick={() => setFitSceneRevision(value => value + 1)}
                      >
                        适配场景
                      </button>
                    </div>
                  </div>
                }
                onSelectionChange={handleSelectionChange}
              />
            </div>
          </div>
        </section>
        <aside className={styles.inspector} aria-label="运动预览控制">
          <h2>{descriptor.displayName}</h2>
          <label className={styles.robotPicker}>
            <span>机器人型号</span>
            <select
              value={descriptor.deviceId}
              disabled={runState === 'running'}
              onChange={event => setActiveDeviceId(event.target.value)}
            >
              {descriptors.map(item => (
                <option key={item.deviceId} value={item.deviceId}>
                  {item.displayName}
                </option>
              ))}
            </select>
          </label>
          <dl>
            <div><dt>资格</dt><dd>{descriptor.capability.grade}</dd></div>
            <div><dt>拾取</dt><dd>{selected ? '已选中' : '未选中'}</dd></div>
            <div><dt>遥测</dt><dd>{streamState}</dd></div>
            <div><dt>最新帧</dt><dd>{lastSequence ?? '尚无'}</dd></div>
            <div><dt>运行</dt><dd>{runState}</dd></div>
          </dl>
          <h3>受限预览工作流</h3>
          {descriptor.workflows.map(workflow => (
            <button
              key={workflow.id}
              type="button"
              className={styles.action}
              disabled={runState === 'running' || streamState !== 'live'}
              onClick={() => {
                void runWorkflow(workflow.id).catch((cause: unknown) => {
                  setError(cause instanceof Error ? cause.message : String(cause))
                })
              }}
            >
              运行“{workflow.label}” · {workflow.stepCount} 步
            </button>
          ))}
          <button
            type="button"
            className={styles.stop}
            disabled={runState !== 'running'}
            onClick={() => {
              void stopWorkflow().catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : String(cause))
              })
            }}
          >
            停止预览
          </button>
          <p className={styles.reason}>{descriptor.capability.reason}</p>
          <p className={styles.digest}>
            source ZIP（只读）<br />
            <code>{descriptor.sourceRelease.archiveName}</code><br />
            SHA-256 <code>{descriptor.sourceDigest}</code>
          </p>
        </aside>
      </div>
    </main>
  )
}

function Banner(): React.JSX.Element {
  return (
    <p className={styles.banner} role="status">
      运动学预览：允许显示、拾取和仿真关节运动；不连接真机，不授予执行或强制空间互锁资格。
    </p>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readError(value: unknown, fallback: string): string {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.msg !== 'string') {
    return fallback
  }
  return value.error.msg
}

export default KinematicPreviewPage
