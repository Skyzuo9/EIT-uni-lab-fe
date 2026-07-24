/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: 主进程登录管理:Bohrium OAuth 弹窗登录 + token 持久化/读取/登出
 * Context: 与 web 登录方式一致——走 Bohrium OAuth,最终拿到 brmToken 并本地保存
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { app, BrowserWindow, session } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { TOKEN_COOKIE_NAMES, buildOAuthUrl, createOAuthState } from './authConfig'

// 登录会话:token 为云端 brmToken,userInfo 为尽力从 JWT 解出的展示信息
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

// 会话持久化文件路径(应用 userData 目录下)
function getSessionFilePath(): string {
  return join(app.getPath('userData'), 'auth-session.json')
}

// 读取本地会话;不存在或损坏返回 null
export function readSession(): AuthSession | null {
  const filePath = getSessionFilePath()
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as AuthSession
    if (parsed && typeof parsed.token === 'string' && parsed.token) return parsed
    return null
  } catch {
    return null
  }
}

// 写入本地会话
function writeSession(sessionData: AuthSession): void {
  writeFileSync(getSessionFilePath(), JSON.stringify(sessionData), 'utf-8')
}

// 清除本地会话与 bohrium 域下的 token cookie
export async function clearSession(): Promise<void> {
  const filePath = getSessionFilePath()
  if (existsSync(filePath)) {
    try {
      rmSync(filePath)
    } catch {
      // 忽略删除失败
    }
  }
  await clearTokenCookies()
}

// 清理默认 session 中的 token cookie(登出用)
async function clearTokenCookies(): Promise<void> {
  const cookies = await session.defaultSession.cookies.get({})
  await Promise.all(
    cookies
      .filter((cookie) => (TOKEN_COOKIE_NAMES as readonly string[]).includes(cookie.name))
      .map(async (cookie) => {
        const domain = cookie.domain?.replace(/^\./, '') ?? ''
        const url = `https://${domain}${cookie.path ?? '/'}`
        try {
          await session.defaultSession.cookies.remove(url, cookie.name)
        } catch {
          // 忽略单个 cookie 清理失败
        }
      })
  )
}

// 尽力解析 JWT payload,提取展示用的用户信息(失败返回 null)
function decodeUserInfo(token: string): AuthUserInfo | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payloadJson = Buffer.from(
      parts[1].replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8')
    const payload = JSON.parse(payloadJson) as Record<string, unknown>
    const name = pickString(payload, ['name', 'username', 'nickname', 'display_name'])
    const email = pickString(payload, ['email', 'mail'])
    const userId = pickString(payload, ['user_id', 'userId', 'sub', 'uid'])
    if (!name && !email && !userId) return null
    return { name, email, userId }
  } catch {
    return null
  }
}

function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value) return value
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

// 从任意 URL 的查询参数中提取 token(兼容 token / access_token)
function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('token') || parsed.searchParams.get('access_token')
  } catch {
    return null
  }
}

// 从默认 session 的 cookie 中提取 brmToken(兼容 test/uat 前缀)
async function extractTokenFromCookies(): Promise<string | null> {
  const cookies = await session.defaultSession.cookies.get({})
  for (const name of TOKEN_COOKIE_NAMES) {
    const hit = cookies.find((cookie) => cookie.name === name && cookie.value)
    if (hit) return hit.value
  }
  return null
}

/**
 * [AI-GENERATED] runOAuthLogin
 *
 * @ai-model Claude Opus 4.8
 * @ai-date 2026-07-24
 * @ai-prompt Electron 弹窗执行 Bohrium OAuth,并在跳转过程中捕获 token
 * @ai-changes 监听导航/重定向,从 URL 或 cookie 捕获 token,成功即关闭弹窗
 *
 * @param parent 父窗口,用于模态弹窗归属
 * @returns 登录成功返回 AuthSession,用户取消返回 null
 */
export function runOAuthLogin(parent: BrowserWindow | null): Promise<AuthSession | null> {
  return new Promise((resolve, reject) => {
    const state = createOAuthState()
    const authUrl = buildOAuthUrl(state)

    const popup = new BrowserWindow({
      width: 480,
      height: 720,
      parent: parent ?? undefined,
      modal: Boolean(parent),
      autoHideMenuBar: true,
      title: '登录 Uni-Lab',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    let settled = false

    const finish = async (url: string): Promise<void> => {
      if (settled) return
      // 优先从 URL 取 token,其次回落到 cookie
      const token = extractTokenFromUrl(url) || (await extractTokenFromCookies())
      if (!token) return
      settled = true
      const authSession: AuthSession = {
        token,
        userInfo: decodeUserInfo(token),
        loggedInAt: Date.now()
      }
      writeSession(authSession)
      cleanup()
      if (!popup.isDestroyed()) popup.close()
      resolve(authSession)
    }

    const handleNavigation = (_event: unknown, url: string): void => {
      void finish(url)
    }

    const cleanup = (): void => {
      // 窗口已销毁时 webContents 不可访问,直接跳过(监听器随窗口一并释放)
      if (popup.isDestroyed()) return
      const contents = popup.webContents
      if (!contents || contents.isDestroyed()) return
      contents.removeListener('will-redirect', handleNavigation)
      contents.removeListener('will-navigate', handleNavigation)
      contents.removeListener('did-navigate', handleNavigation)
    }

    popup.webContents.on('will-redirect', handleNavigation)
    popup.webContents.on('will-navigate', handleNavigation)
    popup.webContents.on('did-navigate', handleNavigation)

    // 窗口关闭:若尚未拿到 token 则视为用户取消
    popup.on('closed', () => {
      cleanup()
      if (!settled) {
        settled = true
        resolve(null)
      }
    })

    popup.loadURL(authUrl).catch((error) => {
      // 重定向会使原始 loadURL 以 ERR_ABORTED(-3) 拒绝,这是 OAuth 跳转的正常现象,忽略之
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('ERR_ABORTED') || message.includes('-3')) return
      if (settled) return
      settled = true
      cleanup()
      if (!popup.isDestroyed()) popup.close()
      reject(error instanceof Error ? error : new Error(String(error)))
    })
  })
}
