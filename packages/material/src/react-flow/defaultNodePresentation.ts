import type { MaterialAggregate } from '../types'

export type DefaultMaterialNodeKind =
  | 'control'
  | 'equipment'
  | 'material'

export interface DefaultMaterialNodePresentation {
  kind: DefaultMaterialNodeKind
  noun: '控制节点' | '仪器设备' | '物料节点'
}

/**
 * Selects the semantic fallback card used when a material has no dedicated
 * physical 2D renderer. Explicit configuration wins; identifiers are only a
 * compatibility fallback for graphs that do not yet publish presentation
 * metadata.
 */
export function readDefaultMaterialNodePresentation(
  aggregate: MaterialAggregate
): DefaultMaterialNodePresentation {
  const config = recordValue(aggregate.material.config)
  const presentation = recordValue(config.presentation)
  const resourceConfig = recordValue(config.resourceConfig)
  const rendering = recordValue(config.rendering)
  const source = recordValue(config.source)
  const hints = [
    presentation.category,
    presentation.kind,
    config.resourceType,
    config.resource_type,
    config.nodeType,
    config.node_type,
    config.kind,
    config.type,
    resourceConfig.resourceType,
    resourceConfig.nodeType,
    resourceConfig.kind,
    resourceConfig.type,
    rendering.resourceType,
    rendering.kind,
    rendering.type,
    source.resourceType,
    source.nodeType,
    source.kind,
    source.type,
    aggregate.material.sourceTemplateId,
    aggregate.material.code,
    aggregate.material.name
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .replaceAll('_', '-')
    .toLowerCase()

  if (
    hasSemanticToken(
      hints,
      'control-node',
      'controller',
      'host-node',
      'coordinator',
      'orchestrator',
      'gateway'
    )
  ) {
    return { kind: 'control', noun: '控制节点' }
  }

  if (
    hasSemanticToken(
      hints,
      'device',
      'equipment',
      'instrument',
      'robot',
      'handler',
      'station',
      'autosampler',
      'dispenser',
      'reader',
      'incubator',
      'centrifuge',
      'prcxi'
    )
  ) {
    return { kind: 'equipment', noun: '仪器设备' }
  }

  return { kind: 'material', noun: '物料节点' }
}

function hasSemanticToken(
  hints: string,
  ...tokens: readonly string[]
): boolean {
  return tokens.some((token) => hints.includes(token))
}

function recordValue(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
