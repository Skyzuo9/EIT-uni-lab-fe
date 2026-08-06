import type { LocalRuntimeLaunchConfig } from '../shared/localRuntime'
import type {
  ActiveLocalDeviceProvisioningRuntime,
  LocalDeviceProvisioningRuntime
} from './localRuntimeLaunchContract'

/** 冻结最近一次成功启动的 Edge 事实，供本地设备接入安全复用。 */
export class LocalDeviceProvisioningRuntimeSession {
  private active: ActiveLocalDeviceProvisioningRuntime | null = null

  /** 只在 Edge 完成就绪校验后提交一份不可被 Renderer 回写的副本。 */
  capture(
    config: LocalRuntimeLaunchConfig,
    runtime: LocalDeviceProvisioningRuntime
  ): void {
    this.active = {
      launchConfig: cloneLaunchConfig(config),
      runtime: { ...runtime }
    }
  }

  /** 返回独立副本；未成功启动过 Edge 时拒绝设备接入操作。 */
  require(): ActiveLocalDeviceProvisioningRuntime {
    if (!this.active) {
      throw new Error('请先在“本地调试”中成功启动一次领域侧 Edge')
    }
    return {
      launchConfig: cloneLaunchConfig(this.active.launchConfig),
      runtime: { ...this.active.runtime }
    }
  }
}

/** 深拷贝 Renderer 可变的本地启动配置。 */
function cloneLaunchConfig(
  config: LocalRuntimeLaunchConfig
): LocalRuntimeLaunchConfig {
  return {
    ...config,
    customEdgeCommand: {
      ...config.customEdgeCommand,
      args: [...config.customEdgeCommand.args],
      environment: config.customEdgeCommand.environment.map((entry) => ({
        ...entry
      }))
    }
  }
}
