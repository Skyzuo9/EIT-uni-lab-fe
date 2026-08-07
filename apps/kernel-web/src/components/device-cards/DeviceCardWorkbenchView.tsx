import { DeviceCardWorkbenchPreview } from './DeviceCardWorkbenchPreview'
import { DeviceCardWorkbenchSidebar } from './DeviceCardWorkbenchSidebar'
import styles from './DeviceCardWorkbench.module.scss'
import type { useDeviceCardWorkbench } from './useDeviceCardWorkbench'

export type DeviceCardWorkbenchModel = ReturnType<
  typeof useDeviceCardWorkbench
>

/**
 * 编排设备卡片工作台的导航与预览区域。
 *
 * @param props 设备卡片工作台模型。
 * @returns 桌面端工作台或 Web 环境不可用提示。
 */
export function DeviceCardWorkbenchView({
  model
}: {
  model: DeviceCardWorkbenchModel
}): React.JSX.Element {
  if (!model.desktopAvailable) return <DesktopUnavailable />

  return (
    <section className={styles.page}>
      <DeviceCardWorkbenchSidebar model={model} />
      <DeviceCardWorkbenchPreview model={model} />
    </section>
  )
}

/** 说明设备卡片开发只能在 Electron 桌面端使用。 */
function DesktopUnavailable(): React.JSX.Element {
  return (
    <section className={styles.unavailable}>
      <h1>设备自定义卡片</h1>
      <p>源码目录预览与安装仅在 Electron 桌面端可用。</p>
    </section>
  )
}
