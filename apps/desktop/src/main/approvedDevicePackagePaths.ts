import type {
  DeviceProvisioningPathSelection
} from '@unilab/device-provisioning'

import { basename, resolve } from 'node:path'

/** Main 应用生命周期内由系统选择器批准的设备包本地路径集合。 */
export class ApprovedDevicePackagePaths {
  private readonly workspaces = new Set<string>()
  private readonly uploadConfigs = new Set<string>()

  /**
   * 记录系统选择器刚返回的路径，并执行文件名级安全约束。
   *
   * @param selection 固定目录或上传配置选择器类别。
   * @param selectedPath Electron dialog 返回的本地路径。
   * @returns 规范化后的绝对路径。
   * @safety 上传配置必须命名为 local_config.py，避免误选普通 Python 脚本。
   */
  approve(
    selection: DeviceProvisioningPathSelection,
    selectedPath: string
  ): string {
    const approvedPath = resolve(selectedPath)
    if (selection.kind === 'packageWorkspace') {
      this.workspaces.add(approvedPath)
    } else {
      if (basename(approvedPath) !== 'local_config.py') {
        throw new Error('上传配置文件名必须为 local_config.py')
      }
      this.uploadConfigs.add(approvedPath)
    }
    return approvedPath
  }

  /**
   * 只允许 Renderer 回传本次明确批准过的同一规范化路径。
   *
   * @param selection 要求的路径用途。
   * @param candidate Renderer 回传的候选路径。
   * @returns 与批准集合完全一致的规范化绝对路径。
   * @safety 拒绝自行构造路径，避免 CLI 读取或执行越权文件。
   */
  require(
    selection: DeviceProvisioningPathSelection,
    candidate: string
  ): string {
    const approvedPath = resolve(candidate)
    const approved = selection.kind === 'packageWorkspace'
      ? this.workspaces
      : this.uploadConfigs
    if (!approved.has(approvedPath)) {
      const label = selection.kind === 'packageWorkspace'
        ? 'Package Workspace'
        : '上传 local_config.py'
      throw new Error(`${label}未经本次系统选择器批准，请重新选择`)
    }
    return approvedPath
  }
}
