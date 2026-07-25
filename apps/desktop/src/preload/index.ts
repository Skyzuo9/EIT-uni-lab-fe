import { contextBridge, ipcRenderer } from 'electron'

// 登录会话结构(与主进程 authManager.AuthSession 保持一致)
export interface AuthUserInfo {
  name?: string
  email?: string
  userId?: string
}

export interface AuthSession {
  token: string
  userInfo: AuthUserInfo | null
  loggedInAt: number
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  auth: {
    // 读取本地已保存的登录会话
    getSession: (): Promise<AuthSession | null> => ipcRenderer.invoke('auth:getSession'),
    // 发起 Bohrium OAuth 登录,成功返回会话,取消返回 null
    login: (): Promise<AuthSession | null> => ipcRenderer.invoke('auth:login'),
    // 登出并清除本地会话
    logout: (): Promise<boolean> => ipcRenderer.invoke('auth:logout')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  ;(globalThis as unknown as { api: Api }).api = api
}

export type Api = typeof api
