import type {
  WorkbenchEnvironmentLogKind,
  WorkbenchRuntimeMode,
  WorkbenchSessionSnapshot
} from '@unilab/workbench-session'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { captureWorkbenchUiOperation } from './workbench-session-gate'
import {
  desktopWorkbenchRemoteApi,
  type DesktopWorkbenchRemoteApi,
  type WorkbenchRemoteAccessSnapshot
} from './desktop-remote-access'

export interface EnvironmentManagerProps {
  session: WorkbenchSessionSnapshot
  onClose: () => void
  onRestartSession: () => Promise<void>
  onReadEnvironmentLog: (kind: WorkbenchEnvironmentLogKind) => Promise<string>
  onConfigureGraph: (graphPath: string) => Promise<void>
  onConfigurePlcSimulator: (projectPath: string) => Promise<void>
  onStartPlcSimulator: () => Promise<void>
  onStopPlcSimulator: () => Promise<void>
  onSetRuntimeMode: (mode: WorkbenchRuntimeMode) => Promise<void>
  onStopSession: () => Promise<void>
}

/** Manage the local OS, PLC simulator and Agent from one visible surface. */
export function EnvironmentManager({
  session,
  onClose,
  onRestartSession,
  onReadEnvironmentLog,
  onConfigureGraph,
  onConfigurePlcSimulator,
  onStartPlcSimulator,
  onStopPlcSimulator,
  onSetRuntimeMode,
  onStopSession
}: EnvironmentManagerProps): React.JSX.Element {
  const identity = session.identity
  const plcSimulator = session.plcSimulator
  const agent = identity?.agent
  const [plcProjectPath, setPlcProjectPath] = useState(plcSimulator.projectPath)
  const [graphPath, setGraphPath] = useState(session.configuredGraphPath)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [logKind, setLogKind] = useState<WorkbenchEnvironmentLogKind>('os')
  const [logTail, setLogTail] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const remoteAccessApi = useMemo(desktopWorkbenchRemoteApi, [])

  useEffect(() => setPlcProjectPath(plcSimulator.projectPath), [
    plcSimulator.projectPath
  ])
  useEffect(() => setGraphPath(session.configuredGraphPath), [
    session.configuredGraphPath
  ])

  const run = useCallback(async (
    action: string,
    operation: () => Promise<void>
  ) => {
    setBusyAction(action)
    setOperationError(null)
    try {
      await captureWorkbenchUiOperation(operation, setOperationError)
    } finally {
      setBusyAction(null)
    }
  }, [])

  const savePlcProjectPath = useCallback(async () => {
    await run('save-plc', () => onConfigurePlcSimulator(plcProjectPath))
  }, [onConfigurePlcSimulator, plcProjectPath, run])

  const applyGraphPath = useCallback(async () => {
    await run('apply-graph', async () => {
      await onConfigureGraph(graphPath)
      await onRestartSession()
    })
  }, [graphPath, onConfigureGraph, onRestartSession, run])

  const startPlcSimulator = useCallback(async () => {
    await run('start-plc', async () => {
      if (plcProjectPath.trim() !== plcSimulator.projectPath) {
        await onConfigurePlcSimulator(plcProjectPath)
      }
      await onStartPlcSimulator()
    })
  }, [
    onConfigurePlcSimulator,
    onStartPlcSimulator,
    plcProjectPath,
    plcSimulator.projectPath,
    run
  ])

  const readSelectedLog = useCallback(async () => {
    await run('read-log', async () => {
      setLogTail(await onReadEnvironmentLog(logKind))
    })
  }, [logKind, onReadEnvironmentLog, run])

  return (
    <section
      className="unilab-environment-manager"
      role="dialog"
      aria-label="环境管理"
      data-testid="environment-manager"
    >
      <header className="unilab-environment-manager__header">
        <div>
          <span className="unilab-environment-manager__eyebrow">MANAGED LOCAL</span>
          <strong>环境管理</strong>
        </div>
        <button type="button" aria-label="关闭环境管理" onClick={onClose}>
          <span className="codicon codicon-close" />
        </button>
      </header>

      {operationError ? (
        <div className="unilab-workbench-session-diagnostic" role="alert">
          <strong>环境操作失败</strong>
          <p>{operationError}</p>
        </div>
      ) : null}

      <div className="unilab-environment-manager__rail" aria-label="本地环境状态链">
        <EnvironmentStatusCard
          name="OS"
          phase={session.phase}
          message={session.message}
          facts={[
            ['PID', String(identity?.pid ?? '—')],
            ['设备图', identity?.graphPath ?? session.configuredGraphPath],
            ['启动模式', identity?.mode === 'dry-run' ? 'Dry-run' : '正常运行'],
            ['API', identity?.backendUrl ?? '—'],
            ['Python', identity?.environmentPath ?? '—']
          ]}
          content={(
            <>
              <label className="unilab-environment-manager__path">
                <span>设备图路径</span>
                <input
                  value={graphPath}
                  disabled={Boolean(busyAction)}
                  placeholder="deployment/graphs/example.json"
                  onChange={event => setGraphPath(event.currentTarget.value)}
                />
              </label>
              <RuntimeModeControl
                mode={identity?.mode}
                disabled={Boolean(busyAction)}
                onSetRuntimeMode={mode => run(
                  'switch-mode',
                  () => onSetRuntimeMode(mode)
                )}
              />
            </>
          )}
          actions={(
            <>
              <button
                type="button"
                disabled={Boolean(busyAction) || !graphPath.trim()}
                onClick={() => void applyGraphPath()}
              >应用设备图并重启</button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => void run('restart-os', onRestartSession)}
              >重启 OS</button>
              <button
                type="button"
                className="is-danger"
                disabled={Boolean(busyAction)}
                onClick={() => void run('stop-os', onStopSession)}
              >停止 OS</button>
            </>
          )}
        />

        <EnvironmentStatusCard
          name="PLC-Sim"
          phase={plcSimulator.phase}
          message={plcSimulator.diagnostic ?? plcSimulator.message}
          facts={[
            ['PID', String(plcSimulator.pid ?? '—')],
            ['GUI', plcSimulator.guiUrl],
            ['OPC UA', plcSimulator.opcUaUrl]
          ]}
          content={(
            <label className="unilab-environment-manager__path">
              <span>项目目录</span>
              <input
                value={plcProjectPath}
                disabled={plcSimulator.phase !== 'idle' && plcSimulator.phase !== 'failed'}
                placeholder="/path/to/PLC-Sim"
                onChange={event => setPlcProjectPath(event.currentTarget.value)}
              />
            </label>
          )}
          actions={(
            <>
              <button
                type="button"
                disabled={
                  Boolean(busyAction)
                  || !plcProjectPath.trim()
                  || plcSimulator.phase === 'ready'
                }
                onClick={() => void startPlcSimulator()}
              >启动 PLC-Sim</button>
              <button
                type="button"
                disabled={Boolean(busyAction) || plcSimulator.phase !== 'ready'}
                onClick={() => void run('stop-plc', onStopPlcSimulator)}
              >停止</button>
              <button
                type="button"
                disabled={
                  Boolean(busyAction)
                  || plcProjectPath.trim() === plcSimulator.projectPath
                }
                onClick={() => void savePlcProjectPath()}
              >保存目录</button>
            </>
          )}
        />

        <EnvironmentStatusCard
          name="Agent"
          phase={agent?.phase ?? 'idle'}
          message={agent?.diagnostic ?? (
            agent?.phase === 'ready' ? '工作区 Agent 已就绪' : 'Agent 未启用'
          )}
          facts={[
            ['PID', String(agent?.pid ?? '—')],
            ['Workdir', agent?.workDir ?? identity?.workspacePath ?? '—'],
            ['Data', agent?.dataDir ?? '—']
          ]}
        />
        {remoteAccessApi ? (
          <RemoteAccessCard api={remoteAccessApi} />
        ) : null}
      </div>

      <section className="unilab-environment-manager__logs">
        <header>
          <strong>日志尾部</strong>
          <div role="group" aria-label="日志来源">
            {([
              ['os', 'OS'],
              ['plc-sim', 'PLC-Sim'],
              ['agent', 'Agent']
            ] as const).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className={logKind === kind ? 'is-active' : ''}
                onClick={() => {
                  setLogKind(kind)
                  setLogTail(null)
                }}
              >{label}</button>
            ))}
          </div>
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => void readSelectedLog()}
          >刷新</button>
        </header>
        {logTail !== null ? (
          <pre data-testid="environment-log-tail">{logTail || '暂无日志'}</pre>
        ) : (
          <p>选择来源后点击“刷新”。</p>
        )}
      </section>
    </section>
  )
}

function RemoteAccessCard({
  api
}: {
  api: DesktopWorkbenchRemoteApi
}): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<WorkbenchRemoteAccessSnapshot | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.getSnapshot().then(value => {
      if (active) setSnapshot(value)
    }).catch(error => {
      if (active) setSnapshot(failedRemoteSnapshot(error))
    })
    return () => { active = false }
  }, [api])

  const update = useCallback(async (
    operation: () => Promise<WorkbenchRemoteAccessSnapshot>
  ) => {
    setBusy(true)
    setCopyStatus(null)
    try {
      setSnapshot(await operation())
    } catch (error) {
      setSnapshot(failedRemoteSnapshot(error))
    } finally {
      setBusy(false)
    }
  }, [])

  const copyAccessUrl = useCallback(async () => {
    if (!snapshot?.accessUrl) return
    try {
      await navigator.clipboard.writeText(snapshot.accessUrl)
      setCopyStatus('访问链接已复制；请按凭据安全传递。')
    } catch {
      setCopyStatus('无法写入剪贴板，请重新开启远程访问后再试。')
    }
  }, [snapshot?.accessUrl])

  const current = snapshot ?? pendingRemoteSnapshot()
  const transitioning = current.phase === 'starting'
    || current.phase === 'stopping'
  return (
    <EnvironmentStatusCard
      name="远程访问"
      phase={current.phase}
      message={copyStatus ?? remoteAccessMessage(current)}
      facts={[
        ['入口', current.origin ?? '—'],
        ['PID', String(current.pid ?? '—')],
        ['Generation', current.generation ?? '—'],
        ['有效期', formatRemoteExpiry(current.expiresAt)]
      ]}
      actions={(
        <>
          {current.phase === 'ready' ? (
            <>
              <button
                type="button"
                disabled={busy || !current.accessUrl}
                onClick={() => void copyAccessUrl()}
              >复制访问链接</button>
              <button
                type="button"
                className="is-danger"
                disabled={busy}
                onClick={() => void update(api.stop)}
              >停止共享</button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy || transitioning || current.phase === 'unavailable'}
              onClick={() => void update(api.start)}
            >允许远程访问</button>
          )}
        </>
      )}
    />
  )
}

function pendingRemoteSnapshot(): WorkbenchRemoteAccessSnapshot {
  return {
    phase: 'starting',
    origin: null,
    accessUrl: null,
    pid: null,
    generation: null,
    expiresAt: null,
    error: null
  }
}

function failedRemoteSnapshot(error: unknown): WorkbenchRemoteAccessSnapshot {
  return {
    ...pendingRemoteSnapshot(),
    phase: 'failed',
    error: error instanceof Error ? error.message : String(error)
  }
}

function remoteAccessMessage(snapshot: WorkbenchRemoteAccessSnapshot): string {
  if (snapshot.phase === 'ready') {
    return '本地 Electron 与远程浏览器正在共享同一个 WorkbenchSession。'
  }
  if (snapshot.phase === 'starting') return '正在建立鉴权浏览器门面…'
  if (snapshot.phase === 'stopping') return '正在撤销访问链接并关闭远程连接…'
  if (snapshot.phase === 'failed') return snapshot.error ?? '远程访问启动失败。'
  if (snapshot.phase === 'unavailable') return '当前不是受支持的桌面 Workbench。'
  return '关闭；Theia 与 OS 仍只接受本机连接。'
}

function formatRemoteExpiry(expiresAt: number | null): string {
  if (!expiresAt) return '—'
  return new Date(expiresAt).toLocaleString()
}

function RuntimeModeControl({
  mode,
  disabled,
  onSetRuntimeMode
}: {
  mode: WorkbenchRuntimeMode | undefined
  disabled: boolean
  onSetRuntimeMode: (mode: WorkbenchRuntimeMode) => Promise<void>
}): React.JSX.Element {
  const select = (next: WorkbenchRuntimeMode): void => {
    if (mode === next) return
    const confirmed = next === 'normal'
      ? globalThis.confirm('关闭 Dry-run 并以正常动作路径重启 OS？')
      : globalThis.confirm(
          '启用 Dry-run 将以 --action_mode simulate 重启 OS，动作不会发送给设备。确认继续？'
        )
    if (confirmed) void onSetRuntimeMode(next)
  }
  return (
    <div className="unilab-environment-manager__mode" role="group" aria-label="OS 运行模式">
      <button
        type="button"
        className={mode === 'normal' ? 'is-active' : ''}
        disabled={disabled}
        onClick={() => select('normal')}
      >正常运行</button>
      <button
        type="button"
        className={mode === 'dry-run' ? 'is-active' : ''}
        disabled={disabled}
        title="动作返回模拟成功；每次 OS 重启使用新的隔离运行数据库"
        onClick={() => select('dry-run')}
      >Dry-run</button>
    </div>
  )
}

function EnvironmentStatusCard({
  name,
  phase,
  message,
  facts,
  content,
  actions
}: {
  name: string
  phase: string
  message: string
  facts: Array<[string, string]>
  content?: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <article className="unilab-environment-card" data-phase={phase}>
      <span className={`unilab-environment-card__dot is-${phase}`} aria-hidden="true" />
      <div className="unilab-environment-card__body">
        <header>
          <strong>{name}</strong>
          <span>{phase}</span>
        </header>
        <p>{message}</p>
        <dl>
          {facts.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd title={value}>{value}</dd>
            </React.Fragment>
          ))}
        </dl>
        {content}
        {actions ? <div className="unilab-environment-card__actions">{actions}</div> : null}
      </div>
    </article>
  )
}
