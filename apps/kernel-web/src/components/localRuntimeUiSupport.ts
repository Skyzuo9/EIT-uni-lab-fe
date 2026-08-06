import { useEffect } from 'react'

import type { DesktopRuntimeApi } from '../types/electron'

/**
 * 读取 Electron 预加载层暴露的本地运行接口。
 *
 * @returns 桌面环境中的本地运行接口；服务端渲染或普通浏览器环境返回 undefined。
 * @throws 不抛出异常。
 * @safety 只读取预加载层白名单接口，不访问任意全局属性或文件路径。
 */
export function desktopRuntimeApi(): DesktopRuntimeApi | undefined {
  return typeof globalThis.window === 'undefined'
    ? undefined
    : globalThis.window.api?.runtime
}

/**
 * 在弹层遮挡设备卡片区域时同步桌面原生表面可见性。
 *
 * @param source 遮挡来源的稳定标识，用于多个弹层独立配对。
 * @param occluded 当前弹层是否遮挡设备卡片表面。
 * @returns 无返回值；状态通过 Electron 预加载接口异步同步。
 * @throws 不向界面抛出异常；预加载接口拒绝时静默保留当前 Web 界面。
 * @safety 组件卸载或遮挡结束时会撤销同一来源的遮挡状态，避免原生表面永久隐藏。
 */
export function useDeviceCardSurfaceOcclusion(
  source: string,
  occluded: boolean
): void {
  useEffect(() => {
    if (typeof globalThis.window === 'undefined') return
    const deviceCards = globalThis.window.api?.deviceCards
    if (!deviceCards) return
    void deviceCards.setOccluded(source, occluded).catch(() => undefined)
    return () => {
      if (!occluded) return
      void deviceCards.setOccluded(source, false).catch(() => undefined)
    }
  }, [occluded, source])
}

/**
 * 把未知异常转换为可展示的错误文本。
 *
 * @param error 捕获到的未知异常值。
 * @returns Error 的 message，或其他值的字符串表示。
 * @throws 不主动抛出异常；仅执行标准字符串转换。
 * @safety 不序列化对象内部字段，避免额外暴露异常上下文。
 */
export function localRuntimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
