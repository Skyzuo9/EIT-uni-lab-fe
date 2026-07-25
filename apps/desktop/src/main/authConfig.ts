/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: pc-client 登录配置(Bohrium OAuth),与 web 登录方式保持一致
 * Context: 复用 web/.env-local 与 web/src/config.ts 的 OAuth/BASE_URL 约定
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */

// 与 web 端保持一致的鉴权配置(默认取 test 环境,可通过环境变量覆盖)
// 对应 web/src/config.ts 的 BASE_URL / OAUTH_URL / OAUTH_CLIENT_ID
export const AUTH_CONFIG = {
  // 云端后端基址(含 /api),用于拼接 OAuth 回调地址
  BASE_URL: process.env.PC_CLIENT_BASE_URL || 'https://leap-lab.test.bohrium.com/api',
  // Bohrium OAuth 平台地址
  OAUTH_URL: process.env.PC_CLIENT_OAUTH_URL || 'https://platform.test.bohrium.com',
  // Bohrium OAuth 应用 ClientId(来源 web/.env-local)
  OAUTH_CLIENT_ID:
    process.env.PC_CLIENT_OAUTH_CLIENT_ID || 'bb154829-8428-4fef-a110-b1066c752520'
} as const

// web 端按 hostname 区分 test/uat/prod 对应的 cookie 名,这里全部纳入探测范围
export const TOKEN_COOKIE_NAMES = ['brmToken', 'test-brmToken', 'uat-brmToken'] as const

// 生成一次性 state,用于 OAuth 防 CSRF(与 web useAutoOAuth 一致的随机串风格)
export function createOAuthState(): string {
  return Math.random().toString(36).slice(2)
}

// 构造 Bohrium OAuth 授权地址,redirect_uri 指向云端后端回调(与 web 完全一致)
export function buildOAuthUrl(state: string): string {
  const redirectUri = encodeURIComponent(`${AUTH_CONFIG.BASE_URL}/auth/callback/brm_oauth/`)
  return (
    `${AUTH_CONFIG.OAUTH_URL}/oauth/?response_type=code` +
    `&client_id=${AUTH_CONFIG.OAUTH_CLIENT_ID}` +
    `&state=${state}` +
    `&redirect_uri=${redirectUri}` +
    `&lang=zh-cn`
  )
}
