import {
  WorkflowIdeHostAdapter,
  type WorkflowIdeHostAdapterSnapshot,
  type WorkflowIdeHostPort
} from '@unilab/workflow-ide-bridge'

/** Theia's real native adapter entrypoint for the shared host-neutral core. */
export function createTheiaWorkflowIdeAdapter(
  host: WorkflowIdeHostPort,
  onSnapshotChange?: (snapshot: WorkflowIdeHostAdapterSnapshot) => void
): WorkflowIdeHostAdapter {
  return new WorkflowIdeHostAdapter(host, onSnapshotChange)
}
