import type { ConnectionStatus } from '../data/lab'

/**
 * The workbench starts against the default Edge profile without requiring an
 * explicit "online" action from the operator.
 */
export const DEFAULT_BACKEND_ENABLED = true

/**
 * Connection controls are recovery UI. A healthy connection (and its initial
 * probe) should stay out of the operator's way.
 */
export function shouldShowConnectionRecovery(
  backendEnabled: boolean,
  connection: ConnectionStatus
): boolean {
  return backendEnabled && connection === 'error'
}
