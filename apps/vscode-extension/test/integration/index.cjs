'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const vscode = require('vscode')

async function run() {
  const extension = vscode.extensions.getExtension('unilab.unilab-authoring')
  assert.ok(extension, 'packaged UniLab VSIX is installed')
  const api = await extension.activate()
  assert.equal(api.compatibility.protocolVersion, 1)

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  assert.ok(workspace, 'fixture workspace is open')
  const workflowFile = vscode.Uri.file(
    path.join(workspace, 'lab', 'workflows', 'main.py')
  )
  const catalogFile = vscode.Uri.file(
    path.join(workspace, 'catalog', 'definitions.py')
  )
  const snapshot = {
    compatibility: api.compatibility,
    packageMounts: [{
      packageId: 'lab',
      packageRootUri: vscode.Uri.file(path.join(workspace, 'lab')).toString(),
      editable: true,
      readOnly: false
    }, {
      packageId: 'catalog',
      packageRootUri: vscode.Uri.file(path.join(workspace, 'catalog')).toString(),
      editable: false,
      readOnly: true
    }],
    sourceProjection: {
      workflowUuid: 'workflow-1',
      sourceUri: 'package://lab/workflows/main.py',
      sourceVersion: 'sha256:integration-v1',
      mappingAvailable: true,
      sourceMap: [{
        workflow_node_uuid: 'node-transfer',
        start_line: 9,
        start_column: 3,
        end_line: 12,
        end_column: 18
      }]
    },
    diagnostics: [{
      sourceUri: 'package://lab/workflows/main.py',
      severity: 'error',
      code: 'integration_error',
      message: 'integration diagnostic',
      line: 9,
      column: 3,
      endLine: 12,
      endColumn: 18
    }]
  }
  await vscode.commands.executeCommand('unilab.ide.publishSnapshot', snapshot)
  await vscode.commands.executeCommand('unilab.ide.openWorkflowSource', {
    workflowUuid: 'workflow-1',
    workflowNodeUuid: 'node-transfer',
    sourceUri: 'package://lab/workflows/main.py',
    line: 9,
    column: 3,
    endLine: 12,
    endColumn: 18
  })

  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(),
    workflowFile.toString())
  assert.equal(vscode.window.activeTextEditor?.selection.start.line, 8)
  assert.equal(vscode.window.activeTextEditor?.selection.start.character, 2)
  assert.equal(vscode.languages.getDiagnostics(workflowFile)[0]?.code,
    'integration_error')

  const editor = vscode.window.activeTextEditor
  assert.ok(editor)
  editor.selection = new vscode.Selection(9, 4, 9, 4)
  await waitFor(() => api.editorContext.workflowNodeUuid === 'node-transfer')
  assert.equal(api.editorContext.activeSourceUri,
    'package://lab/workflows/main.py')

  await vscode.commands.executeCommand('unilab.ide.openPackageSource', {
    sourceUri: 'package://catalog/definitions.py',
    line: 4,
    column: 1,
    endLine: 4,
    endColumn: 16
  })
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(),
    catalogFile.toString())
  await waitFor(() => api.editorContext.activeSourceUri ===
    'package://catalog/definitions.py')

  await vscode.commands.executeCommand('unilab.ide.clearSnapshot')
  assert.equal(vscode.languages.getDiagnostics(workflowFile).length, 0)
}

async function waitFor(predicate) {
  const deadline = Date.now() + 4_000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for IDE context')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

module.exports = { run }
