import type { Node, XYPosition } from 'reactflow'

import {
  invertRigidMatrix,
  matrixToPose,
  multiplyMatrices,
  poseToMatrix,
  transformPoint,
  type Matrix4
} from '../geometry'
import type {
  LabPose,
  MaterialAggregate,
  MaterialId,
  MaterialPlacement
} from '../types'

export interface MaterialFlowNodeData {
  materialId: MaterialId
}

export type MaterialFlowNode = Node<
  MaterialFlowNodeData,
  'material'
>

export const MATERIAL_FLOW_SCALE = 0.5

export function projectMaterialFlowNodes(options: {
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
  dragPreviewByMaterialId?: Readonly<Record<MaterialId, LabPose>>
  selectedMaterialIds?: readonly MaterialId[]
  highlightedMaterialIds?: readonly MaterialId[]
  draggable?: boolean
}): MaterialFlowNode[] {
  const selected = new Set(options.selectedMaterialIds ?? [])
  const highlighted = new Set(options.highlightedMaterialIds ?? [])
  const worldMatrices = resolveWorldMatrices(
    options.aggregatesById,
    options.dragPreviewByMaterialId ?? {}
  )

  return Object.values(options.aggregatesById)
    .map((aggregate) => {
      const materialId = aggregate.material.id
      const placement = withPreview(
        aggregate.placement,
        options.dragPreviewByMaterialId?.[materialId]
      )
      const parentId = placementParentId(placement)
      const worldMatrix = worldMatrices[materialId]
      const parentMatrix = parentId ? worldMatrices[parentId] : undefined
      const position = parentMatrix
        ? worldDeltaToFlow(worldMatrix, parentMatrix)
        : worldPointToFlow([
            worldMatrix[3],
            worldMatrix[7],
            worldMatrix[11]
          ])

      return {
        id: materialId,
        type: 'material',
        parentId: parentId ?? undefined,
        position,
        data: { materialId },
        selected: selected.has(materialId),
        draggable: options.draggable ?? false,
        className: highlighted.has(materialId)
          ? 'material-flow-node--highlighted'
          : undefined
      } satisfies MaterialFlowNode
    })
    .sort((left, right) => {
      const depthDifference =
        materialDepth(left.id, options.aggregatesById) -
        materialDepth(right.id, options.aggregatesById)
      return depthDifference || left.id.localeCompare(right.id)
    })
}

export function flowPositionToPlacement(options: {
  materialId: MaterialId
  flowPosition: XYPosition
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
}): MaterialPlacement {
  const aggregate = options.aggregatesById[options.materialId]
  if (!aggregate) throw new Error(`Unknown Material: ${options.materialId}`)

  const placement = aggregate.placement
  const matrices = resolveWorldMatrices(options.aggregatesById, {})
  const currentWorld = matrices[options.materialId]
  const parentId = placementParentId(placement)
  const parentWorld = parentId ? matrices[parentId] : undefined
  const currentWorldPosition = [
    currentWorld[3],
    currentWorld[7],
    currentWorld[11]
  ] as const
  const desiredWorldPosition = parentWorld
    ? [
        parentWorld[3] + options.flowPosition.x / MATERIAL_FLOW_SCALE,
        parentWorld[7] - options.flowPosition.y / MATERIAL_FLOW_SCALE,
        currentWorldPosition[2]
      ] as const
    : flowPointToWorld(options.flowPosition, currentWorldPosition[2])

  switch (placement.kind) {
    case 'unplaced':
      return {
        kind: 'world',
        pose: {
          positionMm: desiredWorldPosition,
          rotationDegXYZ: [0, 0, 0]
        }
      }
    case 'world':
      return {
        ...placement,
        pose: {
          ...placement.pose,
          positionMm: desiredWorldPosition
        }
      }
    case 'parent': {
      const base = matrices[placement.parentId]
      const localPosition = transformPoint(
        invertRigidMatrix(base),
        desiredWorldPosition
      )
      return {
        ...placement,
        localPose: {
          ...placement.localPose,
          positionMm: localPosition
        }
      }
    }
    case 'site': {
      const parent = options.aggregatesById[placement.parentId]
      const site = parent?.sites.find(
        (candidate) => candidate.id === placement.siteId
      )
      const siteBase = site
        ? multiplyMatrices(
            matrices[placement.parentId],
            poseToMatrix(site.poseInAnchor)
          )
        : matrices[placement.parentId]
      const offsetPosition = transformPoint(
        invertRigidMatrix(siteBase),
        desiredWorldPosition
      )
      return {
        ...placement,
        offsetPose: {
          ...placement.offsetPose,
          positionMm: offsetPosition
        }
      }
    }
  }
}

export function placementPose(placement: MaterialPlacement): LabPose | null {
  switch (placement.kind) {
    case 'unplaced':
      return null
    case 'world':
      return placement.pose
    case 'parent':
      return placement.localPose
    case 'site':
      return placement.offsetPose
  }
}

export function resolveMaterialWorldPose(
  materialId: MaterialId,
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>,
  dragPreviewByMaterialId: Readonly<Record<MaterialId, LabPose>> = {}
): LabPose {
  const matrix = resolveWorldMatrices(
    aggregatesById,
    dragPreviewByMaterialId
  )[materialId]
  if (!matrix) throw new Error(`Unknown Material: ${materialId}`)
  return matrixToPose(matrix)
}

function resolveWorldMatrices(
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>,
  dragPreviewByMaterialId: Readonly<Record<MaterialId, LabPose>>
): Record<MaterialId, Matrix4> {
  const resolved: Record<MaterialId, Matrix4> = {}
  const visiting = new Set<MaterialId>()

  const resolve = (materialId: MaterialId): Matrix4 => {
    if (resolved[materialId]) return resolved[materialId]
    if (visiting.has(materialId)) {
      throw new Error(`Material parent cycle contains ${materialId}`)
    }
    const aggregate = aggregatesById[materialId]
    if (!aggregate) throw new Error(`Unknown Material: ${materialId}`)
    visiting.add(materialId)

    const placement = withPreview(
      aggregate.placement,
      dragPreviewByMaterialId[materialId]
    )
    let matrix: Matrix4
    switch (placement.kind) {
      case 'unplaced':
        matrix = poseToMatrix({
          positionMm: [0, 0, 0],
          rotationDegXYZ: [0, 0, 0]
        })
        break
      case 'world':
        matrix = poseToMatrix(placement.pose)
        break
      case 'parent':
        matrix = multiplyMatrices(
          resolve(placement.parentId),
          poseToMatrix(placement.localPose)
        )
        break
      case 'site': {
        const parent = aggregatesById[placement.parentId]
        const site = parent?.sites.find(
          (candidate) => candidate.id === placement.siteId
        )
        const siteMatrix = site
          ? poseToMatrix(site.poseInAnchor)
          : poseToMatrix({
              positionMm: [0, 0, 0],
              rotationDegXYZ: [0, 0, 0]
            })
        matrix = multiplyMatrices(
          multiplyMatrices(resolve(placement.parentId), siteMatrix),
          poseToMatrix(placement.offsetPose)
        )
        break
      }
    }

    visiting.delete(materialId)
    resolved[materialId] = matrix
    return matrix
  }

  for (const materialId of Object.keys(aggregatesById)) resolve(materialId)
  return resolved
}

function withPreview(
  placement: MaterialPlacement,
  preview: LabPose | undefined
): MaterialPlacement {
  if (!preview) return placement
  switch (placement.kind) {
    case 'unplaced':
      return { kind: 'world', pose: preview }
    case 'world':
      return { ...placement, pose: preview }
    case 'parent':
      return { ...placement, localPose: preview }
    case 'site':
      return { ...placement, offsetPose: preview }
  }
}

function placementParentId(
  placement: MaterialPlacement
): MaterialId | null {
  return placement.kind === 'parent' || placement.kind === 'site'
    ? placement.parentId
    : null
}

function worldPointToFlow(
  point: readonly [number, number, number]
): XYPosition {
  return {
    x: point[0] * MATERIAL_FLOW_SCALE,
    y: -point[1] * MATERIAL_FLOW_SCALE
  }
}

function flowPointToWorld(
  point: XYPosition,
  z: number
): readonly [number, number, number] {
  return [
    point.x / MATERIAL_FLOW_SCALE,
    -point.y / MATERIAL_FLOW_SCALE,
    z
  ]
}

function worldDeltaToFlow(
  child: Matrix4,
  parent: Matrix4
): XYPosition {
  return {
    x: (child[3] - parent[3]) * MATERIAL_FLOW_SCALE,
    y: -(child[7] - parent[7]) * MATERIAL_FLOW_SCALE
  }
}

function materialDepth(
  materialId: MaterialId,
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
): number {
  let depth = 0
  let current = aggregatesById[materialId]
  const visited = new Set<MaterialId>()

  while (current) {
    if (visited.has(current.material.id)) {
      throw new Error(
        `Material parent cycle contains ${current.material.id}`
      )
    }
    visited.add(current.material.id)
    const parentId = placementParentId(current.placement)
    if (!parentId) return depth
    depth += 1
    current = aggregatesById[parentId]
  }

  return depth
}
