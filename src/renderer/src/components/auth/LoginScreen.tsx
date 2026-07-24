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
export default function LoginScreen(): JSX.Element {
  const { login, isLoggingIn, error } = useAuth()

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">Uni-Lab 调试台</div>
        <p className="login__subtitle">请使用 Bohrium 账号登录后继续</p>

        <button
          type="button"
          className="login__button"
          onClick={() => void login()}
          disabled={isLoggingIn}
        >
          {isLoggingIn ? '登录中…' : '使用 Bohrium 账号登录'}
        </button>

        {error && <p className="login__error">{error}</p>}

        <p className="login__hint">登录方式与网页端一致,通过 Bohrium 平台完成授权。</p>
      </div>
    </div>
  )
}
