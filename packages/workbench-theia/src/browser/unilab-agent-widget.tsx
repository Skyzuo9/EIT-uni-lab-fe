import { Message } from '@theia/core/lib/browser'
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget'
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify'
import type { WorkbenchSessionSnapshot } from '@unilab/workbench-session'
import * as React from 'react'

import { WorkbenchSessionServer } from '../common/workbench-session-protocol'
import { WorkbenchSessionClientImpl } from './workbench-session-client'

@injectable()
export class UniLabAgentWidget extends ReactWidget {
  static readonly ID = 'unilab:agent'
  static readonly LABEL = 'UniLab Agent'

  @inject(WorkbenchSessionServer)
  protected readonly workbenchSession!: WorkbenchSessionServer

  @inject(WorkbenchSessionClientImpl)
  protected readonly sessionClient!: WorkbenchSessionClientImpl

  protected snapshot: WorkbenchSessionSnapshot | null = null
  protected frameRevision = 0
  protected agentActionPending = false

  @postConstruct()
  protected init(): void {
    this.id = UniLabAgentWidget.ID
    this.title.label = UniLabAgentWidget.LABEL
    this.title.caption = 'UniLab Agent — current Editable Package sessions'
    this.title.closable = true
    this.title.iconClass = 'codicon codicon-sparkle'
    this.title.dataset = { unilabAgentPanel: 'true' }
    this.node.style.minWidth = '420px'
    this.toDispose.push(this.sessionClient.onSessionChanged(snapshot => {
      this.snapshot = snapshot
      this.update()
    }))
    void this.workbenchSession.getSnapshot().then(snapshot => {
      this.snapshot = snapshot
      this.update()
    })
    this.update()
  }

  protected readonly reload = (): void => {
    this.frameRevision += 1
    this.update()
  }

  protected readonly openStandalone = (): void => {
    const url = this.snapshot?.agent?.url ?? this.snapshot?.identity?.agent?.url
    if (url) globalThis.open(url, '_blank', 'noopener,noreferrer')
  }

  protected readonly startAgent = async (): Promise<void> => {
    if (this.agentActionPending) return
    this.agentActionPending = true
    this.update()
    try {
      this.snapshot = await this.workbenchSession.startAgent()
    } catch {
      this.snapshot = await this.workbenchSession.getSnapshot()
    } finally {
      this.agentActionPending = false
      this.update()
    }
  }

  protected override render(): React.ReactElement {
    const agent = this.snapshot?.agent ?? this.snapshot?.identity?.agent
    const workspaceName = agent?.workDir.split('/').filter(Boolean).at(-1) ??
      'Editable Package'
    if (!agent || agent.phase !== 'ready' || !agent.url) {
      const transitioning = this.agentActionPending
        || agent?.phase === 'starting'
        || agent?.phase === 'stopping'
      return (
        <section className="unilab-aionui unilab-agent__gate">
          <span className={transitioning
            ? 'codicon codicon-loading codicon-modifier-spin'
            : 'codicon codicon-sparkle'} />
          <strong>UniLab Agent</strong>
          <p>{agent?.diagnostic ?? (transitioning
            ? '正在启动工作区 Agent…'
            : '工作区 Agent 尚未启动')}</p>
          <button
            type="button"
            disabled={transitioning}
            onClick={() => void this.startAgent()}
          >{agent?.phase === 'failed' ? '重试' : '启动 Agent'}</button>
        </section>
      )
    }
    return (
      <section
        className="unilab-aionui"
        data-agent-phase={agent.phase}
        data-agent-implementation={agent.implementation}
        data-agent-version={agent.distributionVersion}
        data-agent-work-dir={agent.workDir}
        data-agent-data-dir={agent.dataDir}
      >
        <header className="unilab-aionui__bar">
          <div className="unilab-aionui__identity">
            {agent.iconUrl
              ? <img className="unilab-aionui__logo" src={agent.iconUrl} alt="" />
              : <span className="unilab-aionui__status" aria-label="Local sidecar" />}
            <span className="unilab-aionui__name">UniLab Agent</span>
            <span className="unilab-aionui__workspace" title={agent.workDir}>
              {workspaceName}
            </span>
          </div>
          <div className="unilab-aionui__actions">
            <button type="button" title="重新加载 UniLab Agent" onClick={this.reload}>
              <span className="codicon codicon-refresh" />
            </button>
            <button type="button" title="单独打开 UniLab Agent" onClick={this.openStandalone}>
              <span className="codicon codicon-link-external" />
            </button>
          </div>
        </header>
        <iframe
          key={this.frameRevision}
          className="unilab-aionui__frame"
          src={`${agent.url}/?revision=${this.frameRevision}`}
          title={`UniLab Agent sessions for ${workspaceName}`}
          allow="clipboard-read; clipboard-write; microphone"
        />
      </section>
    )
  }

  protected override onActivateRequest(message: Message): void {
    super.onActivateRequest(message)
    this.node.querySelector<HTMLIFrameElement>('iframe')?.focus()
  }
}
