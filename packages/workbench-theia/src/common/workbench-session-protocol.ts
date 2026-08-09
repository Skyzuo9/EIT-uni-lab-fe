import type { WorkbenchSessionSnapshot } from '@unilab/workbench-session'

export const WORKBENCH_SESSION_PATH = '/services/unilab-workbench-session'
export const WorkbenchSessionServer = Symbol('WorkbenchSessionServer')

export interface WorkbenchSessionServer {
  getSnapshot(): Promise<WorkbenchSessionSnapshot>
  start(): Promise<WorkbenchSessionSnapshot>
}
