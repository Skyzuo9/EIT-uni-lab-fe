import type { MaterialAggregate } from '@unilab/material'
import {
  invertSpatialRigidTransform,
  type SpatialShadowSnapshot
} from '@unilab/spatial-diagnostics'

export interface SpatialShadowRobotBinding {
  materialId: string
  deviceId: string
  topologyDigest: string
  qualifiedJointNames: readonly [string, string, string, string, string, string]
  staleAfterSeconds: number
}

/** 只绑定当前物料图中唯一、完整且精确声明的 EIT CR5 运动学设备。 */
export function resolveSpatialShadowRobotBinding(
  aggregates: readonly MaterialAggregate[]
): SpatialShadowRobotBinding | null {
  const candidates = aggregates.flatMap(aggregate => {
    const config = aggregate.material.config
    const rendering = readRecord(config.rendering)
    const kinematics = readRecord(rendering?.kinematics)
    const model = readRecord(rendering?.model)
    const sourceIdentity = config.sourceIdentity
    const deviceId = kinematics?.device_id
    const topologyDigest = kinematics?.topology_digest
    const qualifiedJointNames = kinematics?.qualified_joint_names
    const staleAfterSeconds = kinematics?.stale_after_s
    const modelPath = model?.path
    if (
      sourceIdentity !== 'robot' ||
      deviceId !== 'robot' ||
      typeof topologyDigest !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(topologyDigest) ||
      !Array.isArray(qualifiedJointNames) ||
      qualifiedJointNames.length !== 6 ||
      !qualifiedJointNames.every(
        name => typeof name === 'string' && name.trim().length > 0
      ) ||
      new Set(qualifiedJointNames).size !== 6 ||
      typeof staleAfterSeconds !== 'number' ||
      !Number.isFinite(staleAfterSeconds) ||
      staleAfterSeconds <= 0 ||
      typeof modelPath !== 'string' ||
      !/(?:^|\/)robot\.urdf$/u.test(modelPath)
    ) return []
    return [{
      materialId: aggregate.material.id,
      deviceId,
      topologyDigest,
      qualifiedJointNames: qualifiedJointNames as [
        string, string, string, string, string, string
      ],
      staleAfterSeconds
    }]
  })
  return candidates.length === 1 ? candidates[0] : null
}

/**
 * 把只读 Shadow CR5 根位姿对齐到编译快照锁定的 rail slot；不写回 Material。
 */
export function alignSpatialShadowRobotBase(
  aggregates: readonly MaterialAggregate[],
  robotMaterialId: string,
  snapshot: SpatialShadowSnapshot
): MaterialAggregate[] {
  const baseMatrixTarget = snapshot.playback.segments[0]?.frames[0]?.links
    .find(link => link.link_id === 'base_link')?.matrix_link_to_world
  if (!baseMatrixTarget) return [...aggregates]
  const sourceMatrix = multiplyMatrix4(
    invertSpatialRigidTransform(snapshot.registration.matrix_source_to_target),
    baseMatrixTarget
  )
  const identityRotation = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ]
  if (identityRotation.some((row, rowIndex) => row.some(
    (expected, columnIndex) =>
      Math.abs(sourceMatrix[rowIndex][columnIndex] - expected) > 1e-6
  ))) return [...aggregates]
  const positionMm = [
    sourceMatrix[0][3] * 1000,
    sourceMatrix[1][3] * 1000,
    sourceMatrix[2][3] * 1000
  ] as const
  return aggregates.map(aggregate => {
    if (
      aggregate.material.id !== robotMaterialId ||
      aggregate.placement.kind !== 'world'
    ) return aggregate
    return {
      ...aggregate,
      placement: {
        ...aggregate.placement,
        pose: {
          ...aggregate.placement.pose,
          positionMm
        }
      }
    }
  })
}

export function spatialShadowFrameSequence(
  snapshot: SpatialShadowSnapshot,
  segmentIndex: number,
  frameIndex: number
): number {
  const preceding = snapshot.playback.segments
    .filter(segment => segment.segment_index < segmentIndex)
    .reduce((total, segment) => total + segment.frames.length, 0)
  return preceding + frameIndex + 1
}

function multiplyMatrix4(
  left: SpatialShadowSnapshot['registration']['matrix_source_to_target'],
  right: SpatialShadowSnapshot['registration']['matrix_source_to_target']
): number[][] {
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) =>
      [0, 1, 2, 3].reduce(
        (sum, index) => sum + left[row][index] * right[index][column],
        0
      )
    )
  )
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
