import type { MaterialScope } from '@unilab/material'
import type { BackendConfig } from '@unilab/services'

export function resolveMaterialScope(
  backend: Pick<BackendConfig, 'workspaceMode'>,
  laboratoryId: string | null
): MaterialScope | null {
  if (backend.workspaceMode === 'singleton') {
    return { kind: 'singleton' }
  }

  const normalized = laboratoryId?.trim()
  return normalized
    ? { kind: 'laboratory', laboratoryId: normalized }
    : null
}
