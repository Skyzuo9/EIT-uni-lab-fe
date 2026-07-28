/** [AI] Model: Claude Opus 4.8 | 2026-07-25 | 通用错误边界:捕获子树渲染错误,避免整页崩溃 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  // 出错时展示的标题
  title?: string
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

// 错误边界:Suspense 只能接住加载 promise,渲染期抛出的错误需由 ErrorBoundary 捕获
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 输出到 renderer console,桌面端主进程会转存到 ~/lab-pc-client.log
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleRetry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) {
      return (
        <div className="panel-error">
          <div className="panel-error__title">{this.props.title ?? '加载失败'}</div>
          <pre className="panel-error__message">{error.message}</pre>
          <button type="button" className="panel-error__retry" onClick={this.handleRetry}>
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
