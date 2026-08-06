import type {
  DeviceProvisioningPathSelection
} from '@unilab/device-provisioning'

import { resolve } from 'node:path'

/** Main 应用生命周期内由系统选择器批准的设备包本地路径集合。 */
export class ApprovedDevicePackagePaths {
  private readonly workspaces = new Set<string>()

  /**
   * 记录系统目录选择器刚返回的 Package Workspace 路径。
   *
   * @param selection 固定 Package Workspace 选择器类别。
   * @param selectedPath Electron dialog 返回的本地路径。
   * @returns 规范化后的绝对路径。
   * @safety Renderer 只能重新使用 Main 本次明确批准的目录。
   */
  approve(
    selection: DeviceProvisioningPathSelection,
    selectedPath: string
  ): string {
    const approvedPath = resolve(selectedPath)
    this.workspaces.add(approvedPath)
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
    if (!this.workspaces.has(approvedPath)) {
      throw new Error('Package Workspace 未经本次系统选择器批准，请重新选择')
    }
    return approvedPath
  }
}
