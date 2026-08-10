import type {
  WorkbenchEnvironmentLogKind,
  WorkbenchRuntimeMode,
  WorkbenchSessionSnapshot
} from '@unilab/workbench-session'

export const WORKBENCH_SESSION_PATH = '/services/unilab-workbench-session'
export const WorkbenchSessionServer = Symbol('WorkbenchSessionServer')
export const WorkbenchSessionClient = Symbol('WorkbenchSessionClient')

export interface WorkbenchSessionClient {
  onDidChange(snapshot: WorkbenchSessionSnapshot): void
}

export interface WorkbenchSessionServer {
  setClient(client: WorkbenchSessionClient): void
  getSnapshot(): Promise<WorkbenchSessionSnapshot>
  start(): Promise<WorkbenchSessionSnapshot>
  stop(): Promise<WorkbenchSessionSnapshot>
  restart(): Promise<WorkbenchSessionSnapshot>
  readLogTail(maxBytes?: number): Promise<string>
  readEnvironmentLog(
    kind: WorkbenchEnvironmentLogKind,
    maxBytes?: number
  ): Promise<string>
  configurePlcSimulator(projectPath: string): Promise<WorkbenchSessionSnapshot>
  startPlcSimulator(): Promise<WorkbenchSessionSnapshot>
  stopPlcSimulator(): Promise<WorkbenchSessionSnapshot>
  setRuntimeMode(mode: WorkbenchRuntimeMode): Promise<WorkbenchSessionSnapshot>
}
