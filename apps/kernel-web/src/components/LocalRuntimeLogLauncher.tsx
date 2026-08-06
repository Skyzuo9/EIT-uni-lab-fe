import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'

import type {
  DesktopRuntimeApi,
  LocalRuntimeLogCursor,
  LocalRuntimeLogsSnapshot,
  LocalRuntimeProcessKind
} from '../types/electron'

import { LocalRuntimeLogDrawer } from './LocalRuntimeLogDrawer'
import { mergeLocalRuntimeLogBatch } from './localRuntimeLogModel'
import styles from './LocalRuntimeLauncher.module.scss'
import {
  desktopRuntimeApi,
  localRuntimeErrorMessage,
  useDeviceCardSurfaceOcclusion
} from './localRuntimeUiSupport'

// 日志抽屉持续读取的固定来源；未激活页签也必须拥有独立游标和最新快照。
const VISIBLE_LOCAL_RUNTIME_LOG_KINDS = ['simulator', 'edge'] as const satisfies
  readonly LocalRuntimeProcessKind[]

interface LocalRuntimeLogLauncherProps {
  runtimeApi?: DesktopRuntimeApi
  variant?: 'toolbar' | 'dialog'
  onOpenChange?: (open: boolean) => void
}

/**
 * 管理本地运行日志抽屉的增量读取、来源切换和自动跟随状态。
 *
 * @param props Electron 日志接口、入口样式及抽屉开关通知。
 * @returns 桌面环境中的日志入口和按需挂载的抽屉；接口缺失时返回 null。
 * @throws 不主动抛出异常；日志读取与目录打开失败转为抽屉错误提示。
 * @safety 只读取主进程白名单日志来源，不接收或拼接任意文件路径。
 */
export function LocalRuntimeLogLauncher({
  runtimeApi = desktopRuntimeApi(),
  variant = 'toolbar',
  onOpenChange
}: LocalRuntimeLogLauncherProps): React.JSX.Element | null {
  const instanceId = useId()
  const drawerId = `local-runtime-log-drawer-${instanceId}`
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] =
    useState<LocalRuntimeLogsSnapshot | null>(null)
  const [activeKind, setActiveKind] =
    useState<LocalRuntimeProcessKind>('edge')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [following, setFollowing] = useState(true)
  const readSequenceRef = useRef(0)
  const snapshotRef = useRef<LocalRuntimeLogsSnapshot | null>(null)
  const cursorRef = useRef<Partial<Record<
    LocalRuntimeProcessKind,
    LocalRuntimeLogCursor | null
  >>>({})

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])
  useDeviceCardSurfaceOcclusion(`local-runtime-log-${variant}`, open)

  /**
   * 关闭日志抽屉并通知外层恢复对应界面状态。
   *
   * @returns 无返回值。
   * @throws 不抛出异常。
   * @safety 只更新当前组件状态，不停止进程或修改日志内容。
   */
  const closeLogs = useCallback((): void => {
    setOpen(false)
    onOpenChange?.(false)
  }, [onOpenChange])

  /**
   * 在同一读取世代内刷新全部可见本地运行日志来源。
   *
   * @returns 全部来源读取并原子合并后结束；没有桌面运行接口时直接返回。
   * @throws 不向调用方抛出异常；读取失败转换为抽屉内错误提示。
   * @safety 每个来源使用独立游标，未激活页签持续刷新且不会覆盖其他来源快照。
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (!runtimeApi) return
    const requestSequence = ++readSequenceRef.current
    setLoading(true)
    setError(null)
    try {
      let nextSnapshot: LocalRuntimeLogsSnapshot
      if (runtimeApi.readLog) {
        const batches = await Promise.all(
          VISIBLE_LOCAL_RUNTIME_LOG_KINDS.map(async (kind) => (
            runtimeApi.readLog?.({
              kind,
              cursor: cursorRef.current[kind] ?? null
            })
          ))
        )
        nextSnapshot = batches.reduce<LocalRuntimeLogsSnapshot | null>(
          (current, batch) => batch
            ? mergeLocalRuntimeLogBatch(current, batch)
            : current,
          snapshotRef.current
        ) ?? { readAt: Date.now(), entries: [] }
        if (requestSequence !== readSequenceRef.current) return
        batches.forEach((batch) => {
          if (batch) cursorRef.current[batch.kind] = batch.cursor
        })
      } else {
        nextSnapshot = await runtimeApi.readLogs()
      }
      if (requestSequence !== readSequenceRef.current) return
      snapshotRef.current = nextSnapshot
      setSnapshot(nextSnapshot)
    } catch (readError) {
      if (requestSequence === readSequenceRef.current) {
        setError(localRuntimeErrorMessage(readError))
      }
    } finally {
      if (requestSequence === readSequenceRef.current) {
        setLoading(false)
      }
    }
  }, [runtimeApi])

  /**
   * 日志抽屉打开时持续增量读取；自动跟随只控制滚动，不得停止诊断数据刷新。
   *
   * @returns 关闭抽屉、切换来源或卸载时清除轮询并使旧请求失效。
   * @throws 不向界面抛出异常；读取失败由 refresh 写入可见错误状态。
   * @safety 只读取当前固定日志来源，不改变进程或日志文件内容。
   */
  useEffect(() => {
    if (!open) return
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void refresh()
    }
    const refreshTimer = globalThis.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void refresh()
      }
    }, 2_000)
    return () => {
      globalThis.clearInterval(refreshTimer)
      readSequenceRef.current += 1
    }
  }, [open, refresh])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeLogs()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeLogs, open])

  if (!runtimeApi) return null

  /**
   * 以全新游标打开日志抽屉，使首次状态来自当前磁盘快照。
   *
   * @returns 无返回值。
   * @throws 不抛出异常；实际读取错误由 refresh 转为界面提示。
   * @safety 清理的仅是当前组件的内存缓存，不会截断或删除日志文件。
   */
  const openLogs = (): void => {
    cursorRef.current = {}
    snapshotRef.current = null
    setSnapshot(null)
    setFollowing(true)
    setError(null)
    setOpen(true)
    onOpenChange?.(true)
  }

  return (
    <>
      <button
        type="button"
        className={variant === 'dialog'
          ? `${styles.secondaryButton} ${styles.headerLogButton}`
          : styles.launcherButton}
        aria-expanded={open}
        aria-controls={drawerId}
        onClick={openLogs}
      >
        查看日志
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <LocalRuntimeLogDrawer
              instanceId={instanceId}
              snapshot={snapshot}
              activeKind={activeKind}
              loading={loading}
              error={error}
              following={following}
              onFollowChange={setFollowing}
              onSelect={(kind) => {
                setActiveKind(kind)
                setFollowing(true)
              }}
              onRefresh={() => void refresh()}
              onOpenFile={() => {
                if (!runtimeApi.openLogFile) return
                setError(null)
                void runtimeApi.openLogFile(activeKind).then((result) => {
                  if (!result.opened) setError(result.error ?? '无法打开日志目录')
                }).catch((openError: unknown) => {
                  setError(localRuntimeErrorMessage(openError))
                })
              }}
              onClose={closeLogs}
            />,
            document.body
          )
        : null}
    </>
  )
}
