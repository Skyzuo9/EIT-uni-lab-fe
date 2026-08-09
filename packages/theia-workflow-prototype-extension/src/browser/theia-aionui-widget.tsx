import { Message } from '@theia/core/lib/browser'
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget'
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify'
import { WorkspaceService } from '@theia/workspace/lib/browser'
import * as React from 'react'

const DEFAULT_AIONUI_URL = 'http://127.0.0.1:25808'

function configuredAionUiUrl(): string {
  const configured = new URLSearchParams(globalThis.location.search)
    .get('aionui')
    ?.trim()
  return (configured || DEFAULT_AIONUI_URL).replace(/\/$/, '')
}

@injectable()
export class TheiaAionUiWidget extends ReactWidget {
  static readonly ID = 'unilab:aionui'
  static readonly LABEL = 'AionUi Agent'

  @inject(WorkspaceService)
  protected readonly workspaceService!: WorkspaceService

  protected workspacePath = 'Loading workspace…'
  protected frameRevision = 0

  @postConstruct()
  protected init(): void {
    this.id = TheiaAionUiWidget.ID
    this.title.label = TheiaAionUiWidget.LABEL
    this.title.caption = 'AionUi — current workspace agent sessions'
    this.title.closable = true
    this.title.iconClass = 'codicon codicon-sparkle'
    this.node.style.minWidth = '420px'
    void this.resolveWorkspacePath()
    this.update()
  }

  protected async resolveWorkspacePath(): Promise<void> {
    const roots = await this.workspaceService.roots
    this.workspacePath = roots[0]?.resource.path.fsPath() ?? 'No workspace'
    this.update()
  }

  protected readonly reload = (): void => {
    this.frameRevision += 1
    this.update()
  }

  protected readonly openStandalone = (): void => {
    globalThis.open(
      `${configuredAionUiUrl()}/__unilab/session`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  protected override render(): React.ReactElement {
    const frameUrl = `${configuredAionUiUrl()}/__unilab/session?revision=${this.frameRevision}`
    return (
      <section className='unilab-aionui'>
        <header className='unilab-aionui__bar'>
          <div className='unilab-aionui__identity'>
            <span className='unilab-aionui__status' aria-label='Local sidecar' />
            <span className='unilab-aionui__name'>AionUi</span>
            <span className='unilab-aionui__workspace' title={this.workspacePath}>
              {this.workspacePath.split('/').filter(Boolean).at(-1) ?? this.workspacePath}
            </span>
          </div>
          <div className='unilab-aionui__actions'>
            <button type='button' title='Reload AionUi' onClick={this.reload}>
              <span className='codicon codicon-refresh' />
            </button>
            <button type='button' title='Open AionUi in a browser tab' onClick={this.openStandalone}>
              <span className='codicon codicon-link-external' />
            </button>
          </div>
        </header>
        <iframe
          key={this.frameRevision}
          className='unilab-aionui__frame'
          src={frameUrl}
          title={`AionUi agent sessions for ${this.workspacePath}`}
          allow='clipboard-read; clipboard-write; microphone'
        />
      </section>
    )
  }

  protected override onActivateRequest(message: Message): void {
    super.onActivateRequest(message)
    this.node.querySelector<HTMLIFrameElement>('iframe')?.focus()
  }
}
