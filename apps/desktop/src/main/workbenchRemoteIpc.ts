import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import type { ElectronObservability } from './observability'
import {
  configureParentProcessWorkbenchRemoteAccess,
  getPackagedWorkbenchRemoteAccess,
  startPackagedWorkbenchRemoteAccess,
  stopPackagedWorkbenchRemoteAccess
} from './packagedRuntime'

export function registerWorkbenchRemoteAccessIpc(options: {
  observability: Pick<ElectronObservability, 'run'>
  assertSender: (event: IpcMainInvokeEvent) => void
}): void {
  configureParentProcessWorkbenchRemoteAccess()
  ipcMain.handle('workbench-remote:getSnapshot', (event) => {
    options.assertSender(event)
    return getPackagedWorkbenchRemoteAccess()
  })
  ipcMain.handle('workbench-remote:start', (event) => {
    options.assertSender(event)
    return options.observability.run(
      'electron.workbench_remote.start',
      {},
      startPackagedWorkbenchRemoteAccess
    )
  })
  ipcMain.handle('workbench-remote:stop', (event) => {
    options.assertSender(event)
    return options.observability.run(
      'electron.workbench_remote.stop',
      {},
      stopPackagedWorkbenchRemoteAccess
    )
  })
}
