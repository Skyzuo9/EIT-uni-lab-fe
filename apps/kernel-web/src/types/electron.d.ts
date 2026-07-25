import type { AuthSession } from './auth'

interface DesktopApi {
  getVersion: () => Promise<string>
  auth: {
    getSession: () => Promise<AuthSession | null>
    login: () => Promise<AuthSession | null>
    logout: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    api?: DesktopApi
  }
}

export {}
