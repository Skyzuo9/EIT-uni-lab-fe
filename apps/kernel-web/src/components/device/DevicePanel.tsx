import { DeviceManagementPanel } from '@unilab/device-management'
import { useServices } from '@unilab/services'

import { useWorkbench } from '../../context/WorkbenchContext'

/** 将 kernel-web 的环境上下文适配到公共设备单点调试面板。 */
export default function DevicePanel(): React.JSX.Element {
  const { backend, backendEnabled, connection } = useWorkbench()
  const services = useServices()

  return (
    <DeviceManagementPanel
      services={services}
      backend={backend}
      backendEnabled={backendEnabled}
      connection={connection}
    />
  )
}

export {
  DeviceActionAvailability,
  DeviceLockControl,
  UnlockConfirmationDialog
} from '@unilab/device-management'
