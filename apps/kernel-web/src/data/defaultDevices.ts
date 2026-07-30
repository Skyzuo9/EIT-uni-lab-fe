import type { OnlineDevice } from '@unilab/services'

export interface ManagedDevice extends OnlineDevice {
  displayName: string
  displayDetail: string
  isDefault: boolean
  reportedByEdge: boolean
}

interface DefaultDeviceDefinition {
  id: string
  displayName: string
  displayDetail: string
}

const DEFAULT_DEVICE_DEFINITIONS: readonly DefaultDeviceDefinition[] = [
  {
    id: 'robot',
    displayName: '机械臂',
    displayDetail: 'Dobot TCP-IP-V4'
  },
  {
    id: 'camera',
    displayName: '相机',
    displayDetail: 'Daheng · RGB8'
  }
]

export function mergeWithDefaultDevices(
  edgeDevices: readonly OnlineDevice[]
): ManagedDevice[] {
  const remaining = new Map(
    edgeDevices.map((device) => [device.id, device])
  )
  const defaults = DEFAULT_DEVICE_DEFINITIONS.map((definition) => {
    const reported = remaining.get(definition.id)
    if (reported) {
      remaining.delete(definition.id)
      return managedDevice(reported, {
        displayName: definition.displayName,
        displayDetail: definition.displayDetail,
        isDefault: true
      })
    }
    return managedDevice(
      {
        id: definition.id,
        deviceKey: `/devices/${definition.id}`,
        namespace: '/devices',
        machineName: '等待 Edge 上报',
        online: false,
        actions: []
      },
      {
        displayName: definition.displayName,
        displayDetail: definition.displayDetail,
        isDefault: true,
        reportedByEdge: false
      }
    )
  })
  return [
    ...defaults,
    ...Array.from(remaining.values(), (device) =>
      managedDevice(device, {
        displayName: device.id,
        displayDetail: device.machineName,
        isDefault: false
      })
    )
  ]
}

function managedDevice(
  device: OnlineDevice,
  presentation: {
    displayName: string
    displayDetail: string
    isDefault: boolean
    reportedByEdge?: boolean
  }
): ManagedDevice {
  return {
    ...device,
    ...presentation,
    reportedByEdge: presentation.reportedByEdge ?? true
  }
}
