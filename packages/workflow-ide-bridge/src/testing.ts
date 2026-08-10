import {
  WorkflowIdeHostAdapter,
  type WorkflowIdeHostAdapterSnapshot,
  type WorkflowIdeHostPort,
  type WorkflowIdeResolvedDiagnostic,
  type WorkflowIdeResolvedLocation
} from './index'

export type WorkflowIdeAdapterFactory = (
  host: WorkflowIdeHostPort,
  onSnapshotChange: (snapshot: WorkflowIdeHostAdapterSnapshot) => void
) => WorkflowIdeHostAdapter

export interface WorkflowIdeAdapterContractTranscript {
  reveals: readonly WorkflowIdeResolvedLocation[]
  diagnosticBatches: ReadonlyArray<readonly WorkflowIdeResolvedDiagnostic[]>
  snapshots: readonly WorkflowIdeHostAdapterSnapshot[]
}

/** One executable contract suite, imported by both native adapter packages. */
export async function exerciseWorkflowIdeAdapterContract(
  createAdapter: WorkflowIdeAdapterFactory
): Promise<WorkflowIdeAdapterContractTranscript> {
  const reveals: WorkflowIdeResolvedLocation[] = []
  const diagnosticBatches: Array<readonly WorkflowIdeResolvedDiagnostic[]> = []
  const snapshots: WorkflowIdeHostAdapterSnapshot[] = []
  const adapter = createAdapter({
    revealSource: async location => { reveals.push(location) },
    replaceDiagnostics: diagnostics => { diagnosticBatches.push(diagnostics) }
  }, snapshot => { snapshots.push(snapshot) })
  adapter.setPackageMounts([{
    packageId: 'lab',
    packageRootUri: 'file:///workspace/lab',
    editable: true,
    readOnly: false
  }, {
    packageId: 'catalog',
    packageRootUri: 'file:///workspace/catalog',
    editable: false,
    readOnly: true
  }])
  adapter.acceptSourceProjection({
    workflowUuid: 'workflow-1',
    sourceUri: 'package://lab/workflows/main.py',
    sourceVersion: 'sha256:source-v1',
    mappingAvailable: true,
    sourceMap: [{
      workflow_node_uuid: 'node-1',
      start_line: 9,
      start_column: 3,
      end_line: 12,
      end_column: 18
    }]
  })
  adapter.acceptEditor({
    currentUri: 'file:///workspace/lab/workflows/main.py',
    dirty: false,
    cursor: { line: 10, column: 5 }
  })
  await adapter.revealSource({
    workflowUuid: 'workflow-1',
    workflowNodeUuid: 'node-1',
    sourceUri: 'package://lab/workflows/main.py',
    line: 9,
    column: 3,
    endLine: 12,
    endColumn: 18
  })
  await adapter.revealSource({
    sourceUri: 'package://catalog/definitions.py',
    line: 4,
    column: 1,
    endLine: 4,
    endColumn: 16
  })
  await adapter.acceptDiagnostics([{
    sourceUri: 'package://lab/workflows/main.py',
    severity: 'error',
    code: 'contract_error',
    message: 'contract diagnostic',
    line: 9,
    column: 3,
    endLine: 12,
    endColumn: 18
  }])
  return { reveals, diagnosticBatches, snapshots }
}
