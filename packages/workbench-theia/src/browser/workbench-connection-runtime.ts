import type { Services } from '@unilab/services'
import type { WorkbenchSessionSnapshot } from '@unilab/workbench-session'
import { useEffect, useState } from 'react'

import {
  WORKBENCH_CONNECTION_STORAGE_KEY,
  resolveInitialWorkbenchConnectionMode,
  serializeWorkbenchConnectionMode,
  type WorkbenchConnectionMode
} from './workbench-connection-profile'
import type { WorkbenchConnectionState } from './workbench-connection-selector'

/**
 * 对选中的 Backend 执行一次健康探测，并拒绝把 HTTP 可达误称为任务成功。
 * @param mode 当前用户确认的运行连接模式。
 * @param services 已按该模式重建的统一服务组合根。
 * @param retryRevision 用户每次明确重试都会增加的探测世代。
 * @returns 当前 Backend 连接状态；Local Authority 状态由 Workspace Backend 会话提供。
 */
export function useBackendConnectionState(
  mode: WorkbenchConnectionMode,
  services: Services,
  retryRevision: number
): WorkbenchConnectionState {
  const [state, setState] = useState<WorkbenchConnectionState>(
    mode === 'backend' ? 'connecting' : 'disconnected'
  )

  useEffect(() => {
    if (mode !== 'backend') {
      setState('disconnected')
      return
    }
    const controller = new AbortController()
    setState('connecting')
    void services.laboratory.ping(controller.signal).then(
      (available) => {
        if (!controller.signal.aborted) {
          setState(available ? 'connected' : 'error')
        }
      },
      () => {
        if (!controller.signal.aborted) setState('error')
      }
    )
    return () => controller.abort()
  }, [mode, retryRevision, services])

  return state
}

/**
 * 将 Workbench 托管 Workspace Backend 阶段投影为领域面板共用的连接状态。
 * @param phase Workspace Backend 的当前生命周期阶段。
 * @returns 只表达传输可用性的连接状态，不表达调度或任务结果。
 */
export function sessionConnectionState(
  phase: WorkbenchSessionSnapshot['phase']
): WorkbenchConnectionState {
  if (phase === 'ready') return 'connected'
  if (phase === 'failed') return 'error'
  if (phase === 'idle') return 'disconnected'
  return 'connecting'
}

/**
 * 从 URL 和浏览器偏好解析 Workbench 初始运行连接。
 * @returns 显式查询优先且未知值失败关闭后的连接模式。
 */
export function initialWorkbenchConnectionMode(): WorkbenchConnectionMode {
  let storedMode: string | null = null
  try {
    storedMode = globalThis.localStorage?.getItem(
      WORKBENCH_CONNECTION_STORAGE_KEY
    ) ?? null
  } catch {
    // 连接偏好不是领域事实；禁用浏览器存储时保持安全缺省值。
  }
  return resolveInitialWorkbenchConnectionMode({
    search: typeof globalThis.location === 'undefined'
      ? ''
      : globalThis.location.search,
    storedMode
  })
}

/**
 * 保存用户确认的连接模式，不保存端点凭证或工作流任务身份。
 * @param mode 用户明确选择的公开连接模式。
 * @returns 无；浏览器禁用存储时只影响下次启动，不影响本次连接。
 */
export function persistWorkbenchConnectionMode(
  mode: WorkbenchConnectionMode
): void {
  try {
    globalThis.localStorage?.setItem(
      WORKBENCH_CONNECTION_STORAGE_KEY,
      serializeWorkbenchConnectionMode(mode)
    )
  } catch {
    // 当前 ReactWidget 已持有本次选择，因此存储失败可以安全降级。
  }
}

/**
 * 返回当前 Theia 页面 Origin，用于构造同源 Backend 代理地址。
 * @returns 浏览器 Origin；测试或服务端渲染环境返回 undefined。
 */
export function currentBrowserOrigin(): string | undefined {
  return typeof globalThis.location === 'undefined'
    ? undefined
    : globalThis.location.origin
}
