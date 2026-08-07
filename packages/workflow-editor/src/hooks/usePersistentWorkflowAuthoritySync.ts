import type {
  WorkflowAuthoringAggregate,
  WorkflowAuthoringChangedEvent,
  WorkflowAuthoringGraph,
  WorkflowRuntimePort
} from '@unilab/services'
import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'

import {
  authoringProjection,
  authoringStateMessage,
  isAuthoringSnapshotDirty,
  isCurrentAuthoringInvalidation,
  isSameAuthoringVersion,
  type AuthoringLocalSnapshot,
  type AuthoringOperationQueue
} from '../utils/persistentAuthoringSession'
import {
  authoritativePython,
  errorMessage
} from '../utils/persistentAuthoringProjection'
import { beautifyPersistentAuthoringGraph } from '../utils/persistentAuthoringGraph'
import type { RemoteConflict } from './persistentWorkflowAuthoringTypes'

interface AuthorityLocalSnapshot extends AuthoringLocalSnapshot {
  aggregate: WorkflowAuthoringAggregate | null
}

interface PersistentWorkflowAuthorityStateAdapter {
  localState: MutableRefObject<AuthorityLocalSnapshot>
  remotePending: MutableRefObject<boolean>
  replaceEditorContent: (content: string) => void
  setAggregate: Dispatch<SetStateAction<WorkflowAuthoringAggregate | null>>
  setGraph: Dispatch<SetStateAction<WorkflowAuthoringGraph | null>>
  setCanvasDirty: Dispatch<SetStateAction<boolean>>
  setSelectedNodeUuid: Dispatch<SetStateAction<string | null>>
  setSelectedNodeName: Dispatch<SetStateAction<string>>
  setSelectedNodeNameDirty: Dispatch<SetStateAction<boolean>>
  setRemoteConflict: Dispatch<SetStateAction<RemoteConflict | null>>
  setMessage: Dispatch<SetStateAction<string>>
  setError: Dispatch<SetStateAction<string | null>>
  setBusy: Dispatch<SetStateAction<boolean>>
}

interface PersistentWorkflowAuthoritySyncOptions {
  runtime: WorkflowRuntimePort
  workflowUuid: string
  queue: AuthoringOperationQueue
  state: PersistentWorkflowAuthorityStateAdapter
}

/**
 * 同步操作系统（OS）权威工作流创作聚合，并保持本地未保存修改连续。
 *
 * @param options 运行端口、工作流身份、串行操作队列与界面状态适配器。
 * @returns 安装权威聚合和显式补读远端冲突的稳定命令。
 */
export function usePersistentWorkflowAuthoritySync({
  runtime,
  workflowUuid,
  queue,
  state
}: PersistentWorkflowAuthoritySyncOptions) {
  const {
    localState,
    remotePending,
    replaceEditorContent,
    setAggregate,
    setGraph,
    setCanvasDirty,
    setSelectedNodeUuid,
    setSelectedNodeName,
    setSelectedNodeNameDirty,
    setRemoteConflict,
    setMessage,
    setError,
    setBusy
  } = state

  /**
   * 安装 OS 权威聚合，并为首次画布展示建立本地美化布局。
   *
   * @param next OS 返回的工作流创作聚合。
   * @param nextMessage 安装后展示的状态文案。
   * @returns 无返回值；自动布局不会制造未保存修改。
   */
  const installAggregate = useCallback((
    next: WorkflowAuthoringAggregate,
    nextMessage: string
  ): void => {
    const projection = authoringProjection(next)
    const beautifiedGraph = beautifyPersistentAuthoringGraph(projection.graph)
    const python = authoritativePython(next)
    setAggregate(next)
    setGraph(beautifiedGraph)
    replaceEditorContent(python)
    setCanvasDirty(false)
    setSelectedNodeUuid(null)
    setSelectedNodeName('')
    setSelectedNodeNameDirty(false)
    setRemoteConflict(null)
    setMessage(nextMessage)
    localState.current = {
      ...localState.current,
      codeDirty: false,
      canvasDirty: false,
      editorValue: python,
      aggregate: next,
      graph: beautifiedGraph,
      selectedNodeUuid: null,
      selectedNodeName: '',
      selectedNodeNameDirty: false
    }
  }, [
    localState,
    replaceEditorContent,
    setAggregate,
    setCanvasDirty,
    setGraph,
    setMessage,
    setRemoteConflict,
    setSelectedNodeName,
    setSelectedNodeNameDirty,
    setSelectedNodeUuid
  ])

  useEffect(
    /**
     * 读取当前工作流的初始 OS 权威创作聚合。
     *
     * @returns 卸载时阻止在途结果写回界面的清理函数。
     */
    function loadInitialAuthoringAuthority(): () => void {
      let active = true
      setBusy(true)
      setError(null)
      void queue.run(
        () => runtime.getWorkflowAuthoring(workflowUuid)
      )
        .then((next) => {
          if (!active) return
          remotePending.current = false
          installAggregate(next, authoringStateMessage(next))
        })
        .catch((loadError) => {
          if (!active) return
          setError(errorMessage(loadError))
        })
        .finally(() => {
          if (active) setBusy(false)
        })
      return () => {
        active = false
      }
    },
    [
      installAggregate,
      queue,
      remotePending,
      runtime,
      setBusy,
      setError,
      workflowUuid
    ]
  )

  useEffect(
    /**
     * 维持工作流创作失效订阅，并在重连后补读 REST 权威状态。
     *
     * @returns 卸载时释放 SSE 与阻止在途结果安装的清理函数。
     */
    function synchronizeAuthoringAuthority(): () => void {
      let active = true
      let refreshInFlight = false
      let refreshPending = false
      let lastRefreshError: string | null = null

      /** 合并并串行执行一次 REST 权威状态刷新。 */
      const refreshFromAuthority = async (): Promise<void> => {
        if (refreshInFlight) {
          refreshPending = true
          return
        }
        refreshInFlight = true
        try {
          do {
            refreshPending = false
            const next = await queue.run(
              () => runtime.getWorkflowAuthoring(workflowUuid)
            )
            if (!active) return
            if (lastRefreshError !== null) {
              const recoveredError = lastRefreshError
              lastRefreshError = null
              setError((current) =>
                current === recoveredError ? null : current
              )
            }
            const current = localState.current
            if (isSameAuthoringVersion(next, current.aggregate)) {
              remotePending.current = false
              continue
            }
            if (isAuthoringSnapshotDirty(current)) {
              // 本地未保存内容优先：忽略远端变更提示，保存时以当前编辑器覆盖。
              remotePending.current = false
              continue
            }
            remotePending.current = false
            installAggregate(next, '已同步外部修改')
          } while (active && refreshPending)
        } catch (refreshError) {
          if (active) {
            lastRefreshError = errorMessage(refreshError)
            setError(lastRefreshError)
          }
        } finally {
          refreshInFlight = false
        }
      }

      /** 把匹配当前工作流的 SSE 失效通知转换为一次 REST 权威刷新。 */
      const handleAuthoringInvalidation = (
        event: WorkflowAuthoringChangedEvent
      ): void => {
        const current = localState.current
        if (isCurrentAuthoringInvalidation(event, current.aggregate)) return
        remotePending.current = true
        void refreshFromAuthority()
      }

      const subscription = runtime.subscribeWorkflowAuthoring(
        workflowUuid,
        handleAuthoringInvalidation,
        {
          onOpen: ({ reconnected }) => {
            setError((current) =>
              current?.startsWith('工作流创作实时同步中断：')
                ? null
                : current
            )
            if (reconnected) {
              remotePending.current = true
              void refreshFromAuthority()
            }
          },
          onError: (streamError) => {
            setError(`工作流创作实时同步中断：${streamError.message}`)
          }
        }
      )
      return () => {
        active = false
        subscription.dispose()
      }
    },
    [
      installAggregate,
      localState,
      queue,
      remotePending,
      runtime,
      setError,
      setMessage,
      setRemoteConflict,
      workflowUuid
    ]
  )

  /**
   * 补读远端权威聚合，并在本地有修改时冻结冲突快照。
   *
   * @returns 远端补读与界面投影完成后的 Promise。
   */
  const readRemoteConflict = useCallback(async (): Promise<void> => {
    const remote = await queue.run(
      () => runtime.getWorkflowAuthoring(workflowUuid)
    )
    const current = localState.current
    if (!isAuthoringSnapshotDirty(current)) {
      remotePending.current = false
      installAggregate(remote, '已同步远端工作流编辑状态')
      return
    }
    // 有本地修改时仍以当前编辑器为准，不弹出远端冲突对话框。
    remotePending.current = false
    setRemoteConflict(null)
    setMessage('检测到远端变化；已忽略，保存时将以当前内容覆盖')
  }, [
    installAggregate,
    localState,
    queue,
    remotePending,
    runtime,
    setMessage,
    setRemoteConflict,
    workflowUuid
  ])

  return { installAggregate, readRemoteConflict }
}
