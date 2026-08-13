import { describe, expect, it } from 'vitest'

import { ApprovedDevicePackagePaths } from './approvedDevicePackagePaths'

/** 覆盖设备包 CLI 路径在 Main 进程内的批准边界。 */
describe('ApprovedDevicePackagePaths', () => {
  /** 验证受控选择器批准的路径可按同一用途回传。 */
  it('接受已批准 Package Workspace', () => {
    const paths = new ApprovedDevicePackagePaths()
    paths.approve({ kind: 'packageWorkspace' }, '/workspace/package')

    expect(paths.require(
      { kind: 'packageWorkspace' },
      '/workspace/./package'
    )).toBe('/workspace/package')
  })

  /** 验证 Renderer 自行构造的目录路径被失败关闭。 */
  it('拒绝未批准路径', () => {
    const paths = new ApprovedDevicePackagePaths()

    expect(() => paths.require(
      { kind: 'packageWorkspace' },
      '/workspace/injected'
    )).toThrow('未经本次系统选择器批准')
  })
})
