import { describe, expect, it } from 'vitest'

import { presentEdgeDevices } from './deviceCatalog'

describe('Edge device catalog', () => {
  it('does not create default devices when Edge reports nothing', () => {
    expect(presentEdgeDevices([])).toEqual([])
  })

  /**
   * 验证系统宿主节点不会伪装成可操作仪器设备。
   *
   * @returns 无返回值；通过空展示列表断言系统节点过滤边界。
   * @throws 系统节点泄漏到设备菜单时由断言报告失败。
   * @safety 只转换内存中的目录夹具，不访问真实设备或执行动作。
   */
  it('hides the system host node from the instrument device list', () => {
    expect(presentEdgeDevices([{
      id: 'host_node',
      deviceKey: '/devices/host_node/host_node',
      namespace: '/devices/host_node',
      machineName: 'Local',
      online: true,
      actions: []
    }])).toEqual([])
  })

  it('presents every Edge device without overriding its identity', () => {
    const devices = presentEdgeDevices([
      {
        id: 'robot',
        deviceKey: '/cell/robot',
        namespace: '/cell',
        machineName: 'Edge A',
        online: true,
        actions: []
      },
      {
        id: 'pump',
        deviceKey: '/cell/pump',
        namespace: '/cell',
        machineName: 'Edge A',
        online: true,
        actions: []
      }
    ])

    expect(devices.map((device) => device.id)).toEqual(['robot', 'pump'])
    expect(devices[0]).toMatchObject({
      displayName: 'robot',
      displayDetail: 'Edge A',
      online: true,
      deviceKey: '/cell/robot'
    })
    expect(devices[1]).toMatchObject({
      displayName: 'pump',
      displayDetail: 'Edge A'
    })
  })
})
