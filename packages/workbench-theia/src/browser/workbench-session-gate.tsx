import type { WorkbenchSessionSnapshot } from '@unilab/workbench-session'
import * as React from 'react'

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

export function WorkbenchSessionGate({
  snapshot,
  onRetry,
  onStop,
  renderEnvironmentManager
}: {
  snapshot: WorkbenchSessionSnapshot
  onRetry: () => Promise<void>
  onStop: () => Promise<void>
  renderEnvironmentManager: (onClose: () => void) => React.ReactNode
}): React.JSX.Element {
  const [environmentOpen, setEnvironmentOpen] = React.useState(
    snapshot.phase === 'failed'
    && snapshot.diagnostic?.code === 'os_readiness_failed'
  )
  const [operationError, setOperationError] = React.useState<string | null>(null)
  const run = React.useCallback(async (operation: () => Promise<void>) => {
    setOperationError(null)
    await captureWorkbenchUiOperation(operation, setOperationError)
  }, [])

  React.useEffect(() => {
    if (
      snapshot.phase === 'failed'
      && snapshot.diagnostic?.code === 'os_readiness_failed'
    ) {
      setEnvironmentOpen(true)
    }
  }, [snapshot.diagnostic?.code, snapshot.phase])

  return (
    <div className="unilab-theia-prototype unilab-workbench-session-gate">
      <section className="unilab-workbench-session-card" aria-live="polite">
        <span className={`unilab-workbench-session-phase is-${snapshot.phase}`}>
          {snapshot.phase}
        </span>
        <h2>UniLab Authoring Workbench</h2>
        <p>{snapshot.message}</p>
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
            <dt>Log</dt>
            <dd>{snapshot.identity.logPath}</dd>
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
        {snapshot.phase === 'idle' || snapshot.phase === 'failed' ? (
          <button onClick={() => void run(onRetry)}>校验并启动</button>
        ) : null}
        {snapshot.phase === 'starting' || snapshot.phase === 'waiting' ? (
          <button onClick={() => void run(onStop)}>停止</button>
        ) : null}
        <button
          type="button"
          aria-expanded={environmentOpen}
          onClick={() => setEnvironmentOpen(value => !value)}
        >环境管理</button>
      </section>
      {environmentOpen
        ? renderEnvironmentManager(() => setEnvironmentOpen(false))
        : null}
    </div>
  )
}
