import type {
  WorkbenchSession,
  WorkbenchSessionSnapshot
} from '@unilab/workbench-session'

export const WORKBENCH_SESSION_PATH = '/services/unilab-workbench-session'
export const WorkbenchSessionServer = Symbol('WorkbenchSessionServer')
export const WorkbenchSessionClient = Symbol('WorkbenchSessionClient')

export interface WorkbenchSessionClient {
  onDidChange(snapshot: WorkbenchSessionSnapshot): void | Promise<void>
}

type WorkbenchSessionRemoteOperations = Pick<
  WorkbenchSession,
  | 'start'
  | 'startWorkspaceBackend'
  | 'stopWorkspaceBackend'
  | 'stop'
  | 'restart'
  | 'rebuildLocalData'
  | 'startAgent'
  | 'stopAgent'
  | 'restartAgent'
  | 'readLogTail'
  | 'readEnvironmentLog'
  | 'configureGraph'
  | 'configurePlcSimulator'
  | 'refreshPlcVariableTables'
  | 'startPlcSimulator'
  | 'stopPlcSimulator'
  | 'releaseEnvironmentPorts'
  | 'setRuntimeMode'
>

export interface WorkbenchSessionServer
extends WorkbenchSessionRemoteOperations {
  setClient(client: WorkbenchSessionClient): void
  getSnapshot(): Promise<WorkbenchSessionSnapshot>
}
