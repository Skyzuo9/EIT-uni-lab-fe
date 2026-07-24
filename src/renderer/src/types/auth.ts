/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: 渲染进程登录相关类型(与主进程 authManager.AuthSession 结构一致)
 * Context: 渲染进程为独立 composite 工程,不跨引用 preload 源码,单独声明同构类型
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */

// 登录用户展示信息(尽力从 JWT 解出)
export interface AuthUserInfo {
  name?: string
  email?: string
  userId?: string
}

// 登录会话:token 为云端 brmToken
export interface AuthSession {
  token: string
  userInfo: AuthUserInfo | null
  loggedInAt: number
}
