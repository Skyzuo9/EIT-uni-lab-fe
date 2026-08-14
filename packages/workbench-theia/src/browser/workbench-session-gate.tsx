import type { WorkbenchSessionSnapshot } from '@unilab/workbench-session'
import * as React from 'react'

import { DesktopWorkspaceSwitchButton } from './desktop-workspace-switch'

export async function captureWorkbenchUiOperation(
  operation: () => Promise<void>,
  onError: (message: string) => void
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error))
  }
}

export async function runAndRefreshWorkbenchOperation(
  operation: () => Promise<void>,
  refresh: () => Promise<void>
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    try {
      await refresh()
    } catch {
      // Preserve the actionable operation error if the follow-up refresh fails.
    }
    throw error
  }
  await refresh()
}

export function WorkbenchSessionGate({
  snapshot,
  onRetry,
  onStop,
  connectionSelector,
  onOpenLog,
  renderEnvironmentManager
}: {
  snapshot: WorkbenchSessionSnapshot
  onRetry: () => Promise<void>
  onStop: () => Promise<void>
  connectionSelector?: React.ReactNode
  onOpenLog?: (path: string) => Promise<void>
  renderEnvironmentManager: (onClose: () => void) => React.ReactNode
}): React.JSX.Element {
  const [environmentOpen, setEnvironmentOpen] = React.useState(
    snapshot.phase === 'failed'
    && snapshot.diagnostic?.code === 'os_readiness_failed'
  )
  const [operationError, setOperationError] = React.useState<string | null>(null)
  const [launchRequested, setLaunchRequested] = React.useState(false)
  const run = React.useCallback(async (operation: () => Promise<void>) => {
    setOperationError(null)
    await captureWorkbenchUiOperation(operation, setOperationError)
  }, [])
  const launchLoading = launchRequested
    || snapshot.phase === 'starting'
    || snapshot.phase === 'waiting'

  const start = React.useCallback(async () => {
    setLaunchRequested(true)
    setOperationError(null)
    await captureWorkbenchUiOperation(onRetry, message => {
      setOperationError(message)
      setLaunchRequested(false)
    })
  }, [onRetry])

  const stop = React.useCallback(async () => {
    await run(onStop)
    setLaunchRequested(false)
  }, [onStop, run])

  React.useEffect(() => {
    if (
      snapshot.phase === 'failed'
      && snapshot.diagnostic?.code === 'os_readiness_failed'
    ) {
      setEnvironmentOpen(true)
    }
  }, [snapshot.diagnostic?.code, snapshot.phase])

  return (
    <div className="unilab-workbench unilab-workbench-session-gate">
      <section className="unilab-workbench-session-card" aria-live="polite">
        <span className={`unilab-workbench-session-phase is-${snapshot.phase}`}>
          {snapshot.phase}
        </span>
        <h2>Unilab 调试工作台</h2>
        <p>{snapshot.message}</p>
        {connectionSelector}
        {snapshot.identity ? (
          <dl>
            <dt>Workspace</dt>
            <dd>{snapshot.identity.workspacePath}</dd>
            <dt>OS PID</dt>
            <dd>{snapshot.identity.pid || '—'}</dd>
            <dt>Generation</dt>
            <dd>{snapshot.identity.generation}</dd>
            <dt>Backend</dt>
            <dd>{snapshot.identity.backendUrl}</dd>
            <div className="unilab-workbench-session-log">
              <dt>Log</dt>
              <dd>
                {onOpenLog ? (
                  <button
                    type="button"
                    title="在编辑器中打开日志文件"
                    onClick={() => void run(
                      () => onOpenLog(snapshot.identity?.logPath ?? '')
                    )}
                  >
                    <span className="codicon codicon-go-to-file" aria-hidden="true" />
                    <span>{snapshot.identity.logPath}</span>
                  </button>
                ) : snapshot.identity.logPath}
              </dd>
            </div>
          </dl>
        ) : null}
        {snapshot.diagnostic ? (
          <div className="unilab-workbench-session-diagnostic" role="alert">
            <strong>{snapshot.diagnostic.code}</strong>
            <p>{snapshot.diagnostic.message}</p>
            <p>{snapshot.diagnostic.recovery}</p>
          </div>
        ) : null}
        {operationError ? (
          <div className="unilab-workbench-session-diagnostic" role="alert">
            <strong>操作失败</strong>
            <p>{operationError}</p>
          </div>
        ) : null}
        <footer className="unilab-workbench-session-actions">
          <div className="unilab-workbench-session-actions__main">
            {snapshot.phase === 'idle' || snapshot.phase === 'failed' ? (
              <button
                type="button"
                className="is-primary"
                onClick={() => void start()}
              >
                <span className="codicon codicon-play" aria-hidden="true" />
                校验并启动
              </button>
            ) : null}
            {snapshot.phase === 'starting' || snapshot.phase === 'waiting' ? (
              <button
                type="button"
                className="is-danger"
                onClick={() => void stop()}
              >
                <span className="codicon codicon-debug-stop" aria-hidden="true" />
                停止
              </button>
            ) : null}
            <button
              className="is-secondary"
              type="button"
              aria-expanded={environmentOpen}
              onClick={() => setEnvironmentOpen(value => !value)}
            >
              <span className="codicon codicon-settings-gear" aria-hidden="true" />
              环境管理
            </button>
          </div>
          <DesktopWorkspaceSwitchButton />
        </footer>
      </section>
      {environmentOpen
        ? renderEnvironmentManager(() => setEnvironmentOpen(false))
        : null}
      {launchLoading ? (
        <div
          className="unilab-workbench-session-loading"
          role="status"
          aria-live="assertive"
          aria-label="正在启动 Unilab 调试工作台"
        >
          <div className="unilab-workbench-session-loading__content">
            <span
              className="unilab-workbench-session-loading__spinner"
              aria-hidden="true"
            />
            <strong>正在启动 Unilab 调试工作台</strong>
            <p>{snapshot.message || '正在校验工作区并启动 Uni-Lab OS…'}</p>
            <button type="button" onClick={() => void stop()}>
              取消启动
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
