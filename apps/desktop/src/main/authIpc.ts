import type { BrowserWindow, IpcMain } from 'electron'

import { clearSession, readSession, runOAuthLogin } from './authManager'
import type { ElectronObservability } from './observability'

interface AuthIpcOptions {
  ipcMain: IpcMain
  getMainWindow: () => BrowserWindow | null
  observability: ElectronObservability
  log: (message: string) => void
}

/** 注册桌面登录会话的读取、OAuth 登录和登出 IPC。 */
export function registerAuthIpc({
  ipcMain,
  getMainWindow,
  observability,
  log
}: AuthIpcOptions): void {
  ipcMain.handle('auth:getSession', () => readSession())
  ipcMain.handle('auth:login', () => observability.run(
    'electron.auth.login',
    {},
    async () => {
      try {
        return await runOAuthLogin(getMainWindow())
      } catch (error) {
        log(`OAuth 登录失败: ${
          error instanceof Error ? error.stack : String(error)
        }`)
        throw error
      }
    }
  ))
  ipcMain.handle('auth:logout', () => observability.run(
    'electron.auth.logout',
    {},
    async () => {
      await clearSession()
      return true
    }
  ))
}
