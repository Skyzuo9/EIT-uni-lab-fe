import { describe, expect, it } from 'vitest'

import { ApprovedDevicePackagePaths } from './approvedDevicePackagePaths'

/** 覆盖设备包 CLI 路径在 Main 进程内的批准边界。 */
describe('ApprovedDevicePackagePaths', () => {
  /** 验证受控选择器批准的路径可按同一用途回传。 */
  it('接受已批准 Workspace 和 local_config.py', () => {
    const paths = new ApprovedDevicePackagePaths()
    paths.approve({ kind: 'packageWorkspace' }, '/workspace/package')
    paths.approve({ kind: 'packageUploadConfig' }, '/secure/local_config.py')

    expect(paths.require(
      { kind: 'packageWorkspace' },
      '/workspace/./package'
    )).toBe('/workspace/package')
    expect(paths.require(
      { kind: 'packageUploadConfig' },
      '/secure/local_config.py'
    )).toBe('/secure/local_config.py')
  })

  /** 验证 Renderer 构造路径和普通 Python 文件均被失败关闭。 */
  it('拒绝未批准路径和错误配置文件名', () => {
    const paths = new ApprovedDevicePackagePaths()

    expect(() => paths.require(
      { kind: 'packageWorkspace' },
      '/workspace/injected'
    )).toThrow('未经本次系统选择器批准')
    expect(() => paths.approve(
      { kind: 'packageUploadConfig' },
      '/secure/script.py'
    )).toThrow('必须为 local_config.py')
  })
})
