/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: 登录界面(Bohrium OAuth 一键登录),未登录时作为门禁展示
 * Context: 调试客户端登录门禁,登录方式与 web 一致(Bohrium 账号)
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useAuth } from '../../context/AuthContext'

// 未登录时展示的登录门禁界面
export default function LoginScreen(): React.JSX.Element {
  const { login, isLoggingIn, error } = useAuth()

  return (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(160deg,#f8fafc_0%,#eef2ff_100%)]">
      <div className="flex w-[360px] flex-col items-center rounded-[14px] border border-[#e5e7eb] bg-white px-8 py-10 shadow-[0_8px_32px_rgba(15,23,42,0.1)]">
        <div className="text-xl font-bold text-[#1f2329]">Uni-Lab 调试台</div>
        <p className="mb-7 mt-2 text-[13px] text-[#6b7280]">请使用 Bohrium 账号登录后继续</p>

        <button
          type="button"
          className="h-[42px] w-full cursor-pointer rounded-lg border-0 bg-[#4f46e5] text-sm font-semibold text-white transition-colors enabled:hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() => void login()}
          disabled={isLoggingIn}
        >
          {isLoggingIn ? '登录中…' : '使用 Bohrium 账号登录'}
        </button>

        {error && <p className="mb-0 mt-3.5 text-xs text-[#dc2626]">{error}</p>}

        <p className="mb-0 mt-[22px] text-center text-[11px] leading-[1.6] text-[#9ca3af]">
          登录方式与网页端一致,通过 Bohrium 平台完成授权。
        </p>
      </div>
    </div>
  )
}
