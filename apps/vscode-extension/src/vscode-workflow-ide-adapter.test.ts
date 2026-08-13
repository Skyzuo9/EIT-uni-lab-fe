import { describe, expect, it } from 'vitest'

import { exerciseWorkflowIdeAdapterContract } from '@unilab/workflow-ide-bridge/testing'

import {
  VscodeWorkflowIdeAdapter,
  assertCompatibility,
  createVscodeWorkflowIdeAdapterCore,
  type UniLabEditorContext,
  type VscodeIdeHostFacade
} from './vscode-workflow-ide-adapter'

describe('VS Code Workflow IDE adapter contract', () => {
  it('passes the same shared native-host contract suite as Theia', async () => {
    const transcript = await exerciseWorkflowIdeAdapterContract(
      createVscodeWorkflowIdeAdapterCore
    )
    expect(transcript.reveals).toEqual([
      expect.objectContaining({
        resolvedUri: 'file:///workspace/lab/workflows/main.py',
        line: 9,
        readOnly: false
      }),
      expect.objectContaining({
        resolvedUri: 'file:///workspace/catalog/definitions.py',
        line: 4,
        readOnly: true
      })
    ])
    expect(transcript.snapshots.at(-1)).toMatchObject({
      activeSourceUri: 'package://lab/workflows/main.py',
      sync: { sourcePosition: { line: 10, column: 5 } }
    })
    expect(transcript.diagnosticBatches.at(-1)?.[0]).toMatchObject({
      code: 'contract_error',
      resolvedUri: 'file:///workspace/lab/workflows/main.py'
    })
  })

  it('maps native editor events back to Workflow and Material highlights', async () => {
    const host = new FakeVscodeHost()
    const adapter = new VscodeWorkflowIdeAdapter(host)
    const contexts: UniLabEditorContext[] = []
    adapter.onDidChangeEditorContext(context => contexts.push(context))
    host.editor = {
      currentUri: 'file:///workspace/lab/workflows/main.py',
      dirty: false,
      cursor: { line: 10, column: 5 }
    }
    await adapter.publishSnapshot({
      compatibility: adapter.compatibility,
      packageMounts: [{
        packageId: 'lab',
        packageRootUri: 'file:///workspace/lab',
        editable: true,
        readOnly: false
      }],
      sourceProjection: {
        workflowUuid: 'workflow-1',
        sourceUri: 'package://lab/workflows/main.py',
        sourceVersion: 'source-v1',
        mappingAvailable: true,
        sourceMap: [{
          workflow_node_uuid: 'node-1',
          start_line: 9,
          start_column: 3,
          end_line: 12,
          end_column: 18
        }]
      },
      diagnostics: []
    })
    host.fireEditorChanged()

    expect(contexts.at(-1)).toEqual({
      activeSourceUri: 'package://lab/workflows/main.py',
      sourcePosition: { line: 10, column: 5 },
      workflowUuid: 'workflow-1',
      workflowNodeUuid: 'node-1',
      mappingStatus: 'active'
    })
  })

  it('fails closed when Workbench and VSIX contracts differ', () => {
    expect(() => assertCompatibility({
      protocolVersion: 2,
      sourceMapContract: 'unilab.workflow-source-map/v1',
      packageSourceContract: 'unilab.package-source/v1',
      minimumOsContract: 'authoring-source-map/v1'
    } as never)).toThrow(/protocolVersion must be 1/)
  })
})

class FakeVscodeHost implements VscodeIdeHostFacade {
  editor = { currentUri: null, dirty: false, cursor: null } as ReturnType<
    VscodeIdeHostFacade['activeEditorSnapshot']
  >
  private listener: (() => void) | null = null

  activeEditorSnapshot(): ReturnType<VscodeIdeHostFacade['activeEditorSnapshot']> {
    return this.editor
  }

  onDidChangeEditor(listener: () => void): { dispose(): void } {
    this.listener = listener
    return { dispose: () => { this.listener = null } }
  }

  fireEditorChanged(): void {
    this.listener?.()
  }

  async revealSource(): Promise<void> {}
  replaceDiagnostics(): void {}
  setStatus(): void {}
  reportError(): void {}
}
