import { describe, expect, it } from 'vitest'

import { mergeWithDefaultDevices } from './defaultDevices'

describe('default device catalog', () => {
  it('keeps the robot and camera as tagged defaults before Edge reports', () => {
    const devices = mergeWithDefaultDevices([])

    expect(devices.map((device) => device.id)).toEqual(['robot', 'camera'])
    expect(devices.every((device) => device.isDefault)).toBe(true)
    expect(devices.every((device) => !device.reportedByEdge)).toBe(true)
  })

  it('merges an Edge device into a matching default without duplicating it', () => {
    const devices = mergeWithDefaultDevices([
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

    expect(devices.map((device) => device.id)).toEqual([
      'robot',
      'camera',
      'pump'
    ])
    expect(devices[0]).toMatchObject({
      displayName: '机械臂',
      isDefault: true,
      reportedByEdge: true,
      online: true,
      deviceKey: '/cell/robot'
    })
    expect(devices[2]).toMatchObject({
      isDefault: false,
      reportedByEdge: true
    })
  })
})
