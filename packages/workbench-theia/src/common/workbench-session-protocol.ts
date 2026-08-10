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
  | 'stop'
  | 'restart'
  | 'readLogTail'
  | 'readEnvironmentLog'
  | 'configureGraph'
  | 'configurePlcSimulator'
  | 'startPlcSimulator'
  | 'stopPlcSimulator'
  | 'setRuntimeMode'
>

export interface WorkbenchSessionServer
extends WorkbenchSessionRemoteOperations {
  setClient(client: WorkbenchSessionClient): void
  getSnapshot(): Promise<WorkbenchSessionSnapshot>
}
