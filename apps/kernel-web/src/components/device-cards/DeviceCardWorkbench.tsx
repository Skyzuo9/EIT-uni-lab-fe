import { DeviceCardWorkbenchView } from './DeviceCardWorkbenchView'
import { useDeviceCardWorkbench } from './useDeviceCardWorkbench'

export default function DeviceCardWorkbench(): React.JSX.Element {
  const model = useDeviceCardWorkbench()
  return <DeviceCardWorkbenchView model={model} />
}
