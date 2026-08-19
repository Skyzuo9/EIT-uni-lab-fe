import type { PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type {
  WorkflowHandlePort,
  WorkflowLink,
  WorkflowNode
} from '../utils/parseWorkflow'
import { projectNestedWorkflow } from '../utils/canonicalWorkflow'
import { useWorkflowDag } from './useWorkflowDag'

vi.mock('reactflow', () => ({
  default: ({ children }: PropsWithChildren) => <div>{children}</div>,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: {
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
    Top: 'top'
  },
  useNodesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: unknown[]) => [initial, vi.fn(), vi.fn()]
}))

describe('useWorkflowDag nested reaction-formula projection', () => {
  it('keeps expanded descendants and internal links without restoring supporting branches', () => {
    const collapsedMarkup = renderProjection(new Set())
    expect(collapsedMarkup).toContain(
      'data-node-ids="outer,primary-source,reaction-materials:seal,seal"'
    )
    expect(collapsedMarkup).not.toContain('get-resource')
    expect(collapsedMarkup).not.toContain('host-transfer')
    expect(collapsedMarkup).not.toContain('put-resource')

    const expandedMarkup = renderProjection(new Set(['outer']))
    expect(expandedMarkup).toContain('get-resource')
    expect(expandedMarkup).toContain('host-transfer')
    expect(expandedMarkup).toContain('put-resource')
    expect(expandedMarkup).toContain('inner-get-host')
    expect(expandedMarkup).toContain('inner-host-put')
    expect(expandedMarkup).not.toContain('reagent-source')
    expect(expandedMarkup).not.toContain('prepare-reagent')
    expect(expandedMarkup).toContain('wfReactionMaterial')

    const childPositions = projectionPositions(expandedMarkup, [
      'get-resource',
      'host-transfer',
      'put-resource'
    ])
    for (const [index, left] of childPositions.entries()) {
      for (const right of childPositions.slice(index + 1)) {
        expect(rectanglesOverlap(left, right, 184, 81)).toBe(false)
      }
    }
    expect(childPositions.every((position) => position.x >= 0)).toBe(true)
    expect(childPositions.every((position) => position.y >= 52)).toBe(true)
    expect(projectionAttribute(expandedMarkup, 'data-node-types'))
      .toContain('wfCompositeContainer')
    expect(projectionAttribute(expandedMarkup, 'data-node-sizes'))
      .toContain('reaction-materials:seal@152x22')
    expect(projectionAttribute(expandedMarkup, 'data-node-parents'))
      .toContain('get-resource>outer')
    expect(projectionAttribute(expandedMarkup, 'data-node-parents'))
      .toContain('host-transfer>outer')
    expect(projectionAttribute(expandedMarkup, 'data-node-parents'))
      .toContain('put-resource>outer')
    expect(projectionAttribute(expandedMarkup, 'data-node-policies'))
      .toContain('get-resource@false:false:false')
    expect(projectionAttribute(expandedMarkup, 'data-node-layers'))
      .toContain('outer@0')
    expect(projectionAttribute(expandedMarkup, 'data-node-layers'))
      .toContain('get-resource@2')
    expect(projectionAttribute(expandedMarkup, 'data-edge-layers'))
      .toContain('inner-get-host@1')

    const edgeRoutes = projectionEdgeRoutes(expandedMarkup)
    for (const edgeId of ['inner-get-host', 'inner-host-put']) {
      const route = edgeRoutes.get(edgeId)
      expect(route, `${edgeId} should expose a routed direction`).toBeDefined()
      const primaryAxisDelta = route?.direction === 'LR'
        ? Math.abs((route?.target.x ?? 0) - (route?.source.x ?? 0))
        : Math.abs((route?.target.y ?? 0) - (route?.source.y ?? 0))
      expect(primaryAxisDelta, `${edgeId} should not have a degenerate route`)
        .toBeGreaterThan(0)
    }
  })

  it('lays out descendants exposed through two expanded subworkflow levels', () => {
    const expandedMarkup = renderProjection(
      new Set(['outer', 'nested-sequence']),
      nestedWorkflowNodes(),
      nestedWorkflowLinks()
    )
    expect(expandedMarkup).toContain('nested-sequence')
    expect(expandedMarkup).toContain('nested-host')
    expect(expandedMarkup).not.toContain('reagent-source')
    expect(projectionAttribute(expandedMarkup, 'data-node-parents'))
      .toContain('nested-sequence>outer')
    expect(projectionAttribute(expandedMarkup, 'data-node-parents'))
      .toContain('nested-host>nested-sequence')

    const nestedPositions = projectionPositions(expandedMarkup, [
      'nested-sequence',
      'nested-host'
    ])
    expect(rectanglesOverlap(
      nestedPositions[0]!,
      nestedPositions[1]!,
      184,
      81
    )).toBe(false)
    const nestedRoute = projectionEdgeRoutes(expandedMarkup)
      .get('inner-nested-host')
    expect(nestedRoute).toBeDefined()
    expect(nestedRoute?.direction).toBe('LR')
    expectProjectionChildrenInsideParents(expandedMarkup)
  })
})

function renderProjection(
  expandedGroupIds: ReadonlySet<string>,
  nodes = workflowNodes(),
  links = workflowLinks()
): string {
  const projection = projectNestedWorkflow(
    nodes,
    links,
    expandedGroupIds
  )
  return renderToStaticMarkup(
    <ProjectionHarness nodes={projection.nodes} links={projection.links} />
  )
}

function nestedWorkflowNodes(): WorkflowNode[] {
  return workflowNodes().map((node) => node.id === 'outer'
    ? {
        ...node,
        childNodeIds: [...(node.childNodeIds ?? []), 'nested-sequence'],
        descendantNodeIds: [
          ...(node.descendantNodeIds ?? []),
          'nested-sequence',
          'nested-host'
        ]
      }
    : node
  ).concat([
    {
      ...action('nested-sequence', [], 'outer'),
      type: 'workflow',
      groupKind: 'subworkflow',
      collapsedByDefault: true,
      childNodeIds: ['nested-host'],
      descendantNodeIds: ['nested-host']
    },
    action('nested-host', [], 'nested-sequence')
  ])
}

function nestedWorkflowLinks(): WorkflowLink[] {
  return [
    ...workflowLinks(),
    readyLink('put-resource', 'nested-sequence', 'inner-put-nested'),
    readyLink('nested-sequence', 'nested-host', 'inner-nested-host')
  ]
}

function ProjectionHarness({
  nodes,
  links
}: {
  nodes: WorkflowNode[]
  links: WorkflowLink[]
}) {
  const projection = useWorkflowDag(
    nodes,
    links,
    'primary-sample-serpentine',
    'horizontal',
    'reaction-formula'
  )
  return (
    <output
      data-node-ids={projection.nodes.map((node) => node.id).sort().join(',')}
      data-node-types={projection.nodes.map((node) => node.type).sort().join(',')}
      data-node-parents={projection.nodes
        .flatMap((node) => node.parentId ? [`${node.id}>${node.parentId}`] : [])
        .sort()
        .join('|')}
      data-edge-ids={projection.edges.map((edge) => edge.id).sort().join(',')}
      data-node-layout={projection.nodes
        .map((node) => `${node.id}@${node.position.x}:${node.position.y}`)
        .sort()
        .join('|')}
      data-node-sizes={projection.nodes
        .map((node) => `${node.id}@${node.width}x${node.height}`)
        .sort()
        .join('|')}
      data-node-policies={projection.nodes
        .map((node) => (
          `${node.id}@${node.draggable}:${node.connectable}:${node.deletable}`
        ))
        .sort()
        .join('|')}
      data-node-layers={projection.nodes
        .map((node) => `${node.id}@${node.zIndex ?? 0}`)
        .sort()
        .join('|')}
      data-edge-layers={projection.edges
        .map((edge) => `${edge.id}@${edge.zIndex ?? 0}`)
        .sort()
        .join('|')}
      data-edge-routes={projection.edges
        .map((edge) => {
          const source = projection.nodes.find((node) => node.id === edge.source)
          const target = projection.nodes.find((node) => node.id === edge.target)
          return `${edge.id}@${edge.data?.direction ?? 'TB'}:` +
            `${source?.position.x ?? 0},${source?.position.y ?? 0}>` +
            `${target?.position.x ?? 0},${target?.position.y ?? 0}`
        })
        .sort()
        .join('|')}
    />
  )
}

interface ProjectionPosition {
  x: number
  y: number
}

interface ProjectionEdgeRoute {
  direction: 'LR' | 'TB'
  source: ProjectionPosition
  target: ProjectionPosition
}

function projectionPositions(
  markup: string,
  nodeIds: readonly string[]
): ProjectionPosition[] {
  const positions = new Map(
    projectionAttribute(markup, 'data-node-layout')
      .split('|')
      .map((entry) => {
        const [nodeId, coordinates] = entry.split('@')
        const [x, y] = coordinates?.split(':').map(Number) ?? []
        return [nodeId, { x, y }] as const
      })
  )
  return nodeIds.map((nodeId) => {
    const position = positions.get(nodeId)
    expect(position, `${nodeId} should have a layout position`).toBeDefined()
    return position!
  })
}

function projectionEdgeRoutes(markup: string): Map<string, ProjectionEdgeRoute> {
  return new Map(
    projectionAttribute(markup, 'data-edge-routes')
      .split('|')
      .map((entry) => {
        const [edgeId, route] = entry.split('@')
        const [direction, coordinates] = route?.split(':') ?? []
        const [source, target] = coordinates?.split('>') ?? []
        const [sourceX, sourceY] = source?.split(',').map(Number) ?? []
        const [targetX, targetY] = target?.split(',').map(Number) ?? []
        return [edgeId, {
          direction: direction as 'LR' | 'TB',
          source: { x: sourceX, y: sourceY },
          target: { x: targetX, y: targetY }
        }] as const
      })
  )
}

function expectProjectionChildrenInsideParents(markup: string): void {
  const positions = new Map(
    projectionAttribute(markup, 'data-node-layout')
      .split('|')
      .map((entry) => {
        const [nodeId, coordinates] = entry.split('@')
        const [x, y] = coordinates?.split(':').map(Number) ?? []
        return [nodeId, { x, y }] as const
      })
  )
  const sizes = new Map(
    projectionAttribute(markup, 'data-node-sizes')
      .split('|')
      .map((entry) => {
        const [nodeId, dimensions] = entry.split('@')
        const [width, height] = dimensions?.split('x').map(Number) ?? []
        return [nodeId, { width, height }] as const
      })
  )
  const parentEntries = projectionAttribute(markup, 'data-node-parents')
    .split('|')
    .filter(Boolean)
    .map((entry) => entry.split('>') as [string, string])

  for (const [childId, parentId] of parentEntries) {
    const position = positions.get(childId)
    const childSize = sizes.get(childId)
    const parentSize = sizes.get(parentId)
    expect(position, `${childId} should have a relative position`).toBeDefined()
    expect(childSize, `${childId} should have a rendered size`).toBeDefined()
    expect(parentSize, `${parentId} should have a container size`).toBeDefined()
    expect(position!.x).toBeGreaterThanOrEqual(0)
    expect(position!.y).toBeGreaterThanOrEqual(0)
    expect(position!.x + childSize!.width)
      .toBeLessThanOrEqual(parentSize!.width)
    expect(position!.y + childSize!.height)
      .toBeLessThanOrEqual(parentSize!.height)
  }
}

function projectionAttribute(markup: string, name: string): string {
  const value = markup.match(new RegExp(`${name}="([^"]*)"`))?.[1]
  expect(value, `${name} should be rendered`).toBeDefined()
  return value!.replaceAll('&gt;', '>')
}

function rectanglesOverlap(
  left: ProjectionPosition,
  right: ProjectionPosition,
  width: number,
  height: number
): boolean {
  return left.x < right.x + width && left.x + width > right.x &&
    left.y < right.y + height && left.y + height > right.y
}

function workflowNodes(): WorkflowNode[] {
  const primaryOutput = resourceSlot('primary-output', 'sample', 'source')
  const reagentOutput = resourceSlot('reagent-output', 'reagent', 'source')
  return [
    materialSource('primary-source', 'primary_sample', primaryOutput),
    materialSource('reagent-source', 'reagent', reagentOutput),
    {
      ...action('outer', [
        resourceSlot('outer-input', 'sample', 'target'),
        resourceSlot('outer-output', 'sample', 'source')
      ]),
      type: 'workflow',
      groupKind: 'subworkflow',
      collapsedByDefault: true,
      childNodeIds: ['get-resource', 'host-transfer', 'put-resource'],
      descendantNodeIds: ['get-resource', 'host-transfer', 'put-resource'],
      compositeBoundaryMappings: {
        targets: {
          'outer-input': [{
            nodeUuid: 'get-resource',
            handleUuid: 'get-resource-input'
          }]
        },
        sources: {
          'outer-output': {
            nodeUuid: 'put-resource',
            handleUuid: 'put-resource-output'
          }
        }
      }
    },
    action('get-resource', [
      resourceSlot('get-resource-input', 'sample', 'target'),
      resourceSlot('get-resource-output', 'sample', 'source')
    ], 'outer'),
    action('host-transfer', [
      resourceSlot('host-transfer-input', 'sample', 'target'),
      resourceSlot('host-transfer-output', 'sample', 'source')
    ], 'outer'),
    action('put-resource', [
      resourceSlot('put-resource-input', 'sample', 'target'),
      resourceSlot('put-resource-output', 'sample', 'source')
    ], 'outer'),
    action('prepare-reagent', [
      resourceSlot('prepare-reagent-input', 'reagent', 'target'),
      resourceSlot('prepare-reagent-output', 'reagent', 'source')
    ]),
    action('seal', [
      resourceSlot('seal-sample-input', 'sample', 'target'),
      resourceSlot('seal-reagent-input', 'reagent', 'target')
    ])
  ]
}

function workflowLinks(): WorkflowLink[] {
  return [
    materialLink(
      'primary-source',
      'primary-output',
      'outer',
      'outer-input',
      'primary-outer'
    ),
    materialLink(
      'outer',
      'outer-output',
      'seal',
      'seal-sample-input',
      'outer-seal'
    ),
    materialLink(
      'get-resource',
      'get-resource-output',
      'host-transfer',
      'host-transfer-input',
      'inner-get-host'
    ),
    materialLink(
      'host-transfer',
      'host-transfer-output',
      'put-resource',
      'put-resource-input',
      'inner-host-put'
    ),
    materialLink(
      'reagent-source',
      'reagent-output',
      'prepare-reagent',
      'prepare-reagent-input',
      'reagent-prepare'
    ),
    materialLink(
      'prepare-reagent',
      'prepare-reagent-output',
      'seal',
      'seal-reagent-input',
      'prepare-seal'
    )
  ]
}

function materialSource(
  id: string,
  flowRole: string,
  output: WorkflowHandlePort
): WorkflowNode {
  return {
    id,
    name: id,
    type: 'material_source',
    className: 'MaterialSource',
    labNodeType: 'MaterialSource',
    handles: [output],
    materialSource: {
      mode: 'existing',
      flowRole,
      mountUuid: `${id}-mount`,
      resourceTemplateUuid: `${id}-template`
    }
  }
}

function action(
  id: string,
  handles: WorkflowHandlePort[],
  parentGroupId?: string
): WorkflowNode {
  return {
    id,
    name: id,
    type: 'action',
    className: 'Action',
    labNodeType: 'Action',
    handles,
    ...(parentGroupId ? { parentGroupId } : {})
  }
}

function resourceSlot(
  uuid: string,
  dataKey: string,
  ioType: 'source' | 'target'
): WorkflowHandlePort {
  return {
    uuid,
    handleKey: dataKey,
    displayName: dataKey,
    dataKey,
    ioType,
    valueType: 'ResourceSlot',
    valueSchema: { $slot: 'ResourceSlot' }
  }
}

function materialLink(
  source: string,
  sourceHandleUuid: string,
  target: string,
  targetHandleUuid: string,
  id: string
): WorkflowLink {
  return { id, source, sourceHandleUuid, target, targetHandleUuid, type: 'control' }
}

function readyLink(source: string, target: string, id: string): WorkflowLink {
  return { id, source, target, type: 'control' }
}
