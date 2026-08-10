import type { WorkbenchSessionDiagnostic } from './index'

/** Structured launch failure that remains actionable in the Workbench UI. */
export class WorkbenchLaunchError extends Error {
  readonly diagnostic: WorkbenchSessionDiagnostic

  constructor(
    code: WorkbenchSessionDiagnostic['code'],
    message: string,
    recovery: string
  ) {
    super(message)
    this.diagnostic = { code, message, recovery }
  }
}
