import * as vscode from 'vscode'

import type {
  PackageSourceLocation,
  WorkflowIdeDiagnosticSeverity,
  WorkflowIdeEditorSnapshot,
  WorkflowIdeResolvedDiagnostic,
  WorkflowIdeResolvedLocation,
  WorkflowSourceLocation
} from '@unilab/workflow-ide-bridge'

import {
  VscodeWorkflowIdeAdapter,
  type DisposableLike,
  type UniLabEditorContext,
  type UniLabIdeExtensionApi,
  type UniLabIdePublishedSnapshot,
  type VscodeIdeHostFacade
} from './vscode-workflow-ide-adapter'

export function activate(context: vscode.ExtensionContext): UniLabIdeExtensionApi {
  const host = new NativeVscodeIdeHost()
  const adapter = new VscodeWorkflowIdeAdapter(host)
  context.subscriptions.push(
    adapter,
    host,
    vscode.commands.registerCommand(
      'unilab.ide.publishSnapshot',
      async (snapshot: UniLabIdePublishedSnapshot | undefined) => {
        if (!snapshot) throw new Error('缺少 UniLab IDE bridge snapshot')
        await adapter.publishSnapshot(snapshot)
      }
    ),
    vscode.commands.registerCommand(
      'unilab.ide.clearSnapshot',
      () => adapter.clearSnapshot()
    ),
    vscode.commands.registerCommand(
      'unilab.ide.openWorkflowSource',
      async (location: WorkflowSourceLocation | undefined) => {
        if (!location) throw new Error('缺少 Workflow source location')
        await adapter.openWorkflowSource(location)
      }
    ),
    vscode.commands.registerCommand(
      'unilab.ide.openPackageSource',
      async (location: PackageSourceLocation | undefined) => {
        if (!location) throw new Error('缺少 Package source location')
        await adapter.openPackageSource(location)
      }
    ),
    vscode.commands.registerCommand(
      'unilab.ide.showCompatibility',
      () => vscode.window.showInformationMessage(
        `UniLab IDE bridge v${adapter.compatibility.protocolVersion} · ` +
        `${adapter.compatibility.sourceMapContract}`
      )
    )
  )
  return adapter
}

export function deactivate(): void {
  // VS Code disposes the ExtensionContext subscriptions.
}

class NativeVscodeIdeHost implements VscodeIdeHostFacade, vscode.Disposable {
  private readonly diagnostics =
    vscode.languages.createDiagnosticCollection('unilab')
  private readonly status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    72
  )
  private readonly highlight = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('editor.findMatchBorder')
  })
  private highlightTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    this.status.name = 'UniLab IDE Bridge'
    this.status.command = 'unilab.ide.showCompatibility'
    this.status.text = '$(beaker) UniLab · IDE bridge'
    this.status.tooltip = 'UniLab Workflow/Material source navigation'
    this.status.show()
  }

  activeEditorSnapshot(): WorkflowIdeEditorSnapshot {
    const editor = vscode.window.activeTextEditor
    if (!editor) return { currentUri: null, dirty: false, cursor: null }
    const cursor = editor.selection.active
    return {
      currentUri: editor.document.uri.toString(),
      dirty: editor.document.isDirty,
      cursor: { line: cursor.line + 1, column: cursor.character + 1 }
    }
  }

  onDidChangeEditor(listener: () => void): DisposableLike {
    return vscode.Disposable.from(
      vscode.window.onDidChangeActiveTextEditor(listener),
      vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor === vscode.window.activeTextEditor) listener()
      }),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document) listener()
      }),
      vscode.workspace.onDidSaveTextDocument(document => {
        if (document === vscode.window.activeTextEditor?.document) listener()
      }),
      vscode.workspace.onDidCloseTextDocument(document => {
        if (document.uri.toString() === this.activeEditorSnapshot().currentUri) {
          listener()
        }
      })
    )
  }

  async revealSource(location: WorkflowIdeResolvedLocation): Promise<void> {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.parse(location.resolvedUri, true)
    )
    const range = new vscode.Range(
      location.line - 1,
      location.column - 1,
      location.endLine - 1,
      location.endColumn - 1
    )
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
      preview: false,
      selection: range
    })
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    editor.setDecorations(this.highlight, [range])
    if (this.highlightTimer) clearTimeout(this.highlightTimer)
    this.highlightTimer = setTimeout(() => {
      editor.setDecorations(this.highlight, [])
      this.highlightTimer = undefined
    }, 4_000)
    await vscode.commands.executeCommand(
      'setContext',
      'unilab.activeSourceReadOnly',
      location.readOnly
    )
  }

  replaceDiagnostics(
    diagnostics: readonly WorkflowIdeResolvedDiagnostic[]
  ): void {
    this.diagnostics.clear()
    const grouped = new Map<string, vscode.Diagnostic[]>()
    for (const diagnostic of diagnostics) {
      const target = vscode.Uri.parse(diagnostic.resolvedUri, true)
      const values = grouped.get(target.toString()) ?? []
      const marker = new vscode.Diagnostic(
        new vscode.Range(
          diagnostic.line - 1,
          diagnostic.column - 1,
          diagnostic.endLine - 1,
          diagnostic.endColumn - 1
        ),
        diagnostic.message,
        diagnosticSeverity(diagnostic.severity)
      )
      marker.code = diagnostic.code
      marker.source = diagnostic.source
      values.push(marker)
      grouped.set(target.toString(), values)
    }
    this.diagnostics.set([...grouped].map(([uri, values]) => [
      vscode.Uri.parse(uri, true),
      values
    ]))
  }

  setStatus(context: UniLabEditorContext): void {
    const status = context.mappingStatus === 'active'
      ? context.workflowNodeUuid
        ? `node ${context.workflowNodeUuid.slice(0, 8)}`
        : 'ready'
      : context.mappingStatus.replace('paused: ', '')
    this.status.text = `$(beaker) UniLab · ${status}`
    this.status.tooltip = context.activeSourceUri ?? 'UniLab IDE bridge'
  }

  reportError(message: string): void {
    void vscode.window.showErrorMessage(`UniLab IDE bridge：${message}`)
  }

  dispose(): void {
    if (this.highlightTimer) clearTimeout(this.highlightTimer)
    this.highlight.dispose()
    this.diagnostics.dispose()
    this.status.dispose()
  }
}

function diagnosticSeverity(
  severity: WorkflowIdeDiagnosticSeverity
): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error': return vscode.DiagnosticSeverity.Error
    case 'warning': return vscode.DiagnosticSeverity.Warning
    case 'information': return vscode.DiagnosticSeverity.Information
    case 'hint': return vscode.DiagnosticSeverity.Hint
  }
}
