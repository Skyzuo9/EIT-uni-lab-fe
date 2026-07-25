/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: pc-client 登录配置(Bohrium 统一登录),与 web goToLogin 保持一致
 * Context: 复用 web/src/utils/login.ts 的 /login?business=Bohrium&redirect= 流程
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */

// 与 web 端保持一致的鉴权配置(默认取 test 环境,可通过环境变量覆盖)
// 说明:web 真正生效的登录是 utils/login.ts 的 goToLogin —— 走 Bohrium 统一登录
// (/login?business=Bohrium&redirect=...),登录后 Bohrium 通过 ?token= 回跳并在
// .bohrium.com 写 brmToken cookie。此前使用的 /oauth/?redirect_uri=.../api/auth/callback/brm_oauth/
// 流程在后端并无对应路由(仅 casdoor 回调),回调地址 404,故弃用。
export const AUTH_CONFIG = {
  // Bohrium 统一登录平台地址(对应 web/.env-test 的 NEXT_PUBLIC_BRM_OAUTH_URL)
  OAUTH_URL: process.env.PC_CLIENT_OAUTH_URL || 'https://platform.test.bohrium.com',
  // 登录成功后的回跳地址(前端站点),Bohrium 会在其后追加 ?token=<brmToken>
  // 对应 web goToLogin 里的 redirect: window.location.href
  SITE_URL: process.env.PC_CLIENT_SITE_URL || 'https://leap-lab.test.bohrium.com/leap-lab'
} as const

// web 端按 hostname 区分 test/uat/prod 对应的 cookie 名,这里全部纳入探测范围
export const TOKEN_COOKIE_NAMES = ['brmToken', 'test-brmToken', 'uat-brmToken'] as const

// 构造 Bohrium 统一登录地址(与 web/src/utils/login.ts 的 goToLogin 完全一致)
// business=Bohrium 指定业务方,redirect 为登录后的回跳地址
export function buildOAuthUrl(): string {
  const params = new URLSearchParams({
    business: 'Bohrium',
    t: String(Date.now()),
    redirect: AUTH_CONFIG.SITE_URL,
    lang: 'zh-cn'
  })
  return `${AUTH_CONFIG.OAUTH_URL}/login?${params.toString()}`
}
