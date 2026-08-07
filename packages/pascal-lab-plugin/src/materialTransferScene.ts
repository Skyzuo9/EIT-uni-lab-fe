import { composePoses, type MaterialAggregate, type MaterialId } from '@unilab/material/domain'
import type { MaterialTransferSceneEndpoint, MaterialTransferSceneRoute } from './materialAggregateSceneTypes'
import { resolveAggregateWorldPose } from './materialPlacementProjection'
import { optionalString, readRecord } from './materialSceneWire'
import { labPoseToPascal, type Vector3Tuple } from './units'

export function projectMaterialTransferSceneLayer(
  aggregates: readonly MaterialAggregate[],
  routes: readonly MaterialTransferSceneRoute[]
): {
  routes: Array<{
    id: string
    workflowNodeUuid: string
    label: string
    sourceOwnerMaterialId: string
    sourceSiteId: string
    sourceSiteKey: string
    targetOwnerMaterialId: string
    targetSiteId: string
    targetSiteKey: string
    executorId: string
    status: MaterialTransferSceneRoute['status']
    selected: boolean
    points: Vector3Tuple[]
  }>
  unresolvedRouteIds: string[]
} {
  const aggregatesById = new Map(
    aggregates.flatMap((aggregate) => {
      const config = readRecord(aggregate.material.config)
      const identities = new Set([
        aggregate.material.id,
        optionalString(config.sourceIdentity)
      ].filter((value): value is string => Boolean(value)))
      return [...identities].map((identity) => [identity, aggregate] as const)
    })
  )
  const canonicalAggregatesById = Object.fromEntries(
    aggregates.map((aggregate) => [aggregate.material.id, aggregate])
  )
  const projected = []
  const unresolvedRouteIds: string[] = []

  for (const route of routes) {
    const source = resolveTransferEndpoint(
      route.source,
      aggregatesById,
      canonicalAggregatesById
    )
    const target = resolveTransferEndpoint(
      route.target,
      aggregatesById,
      canonicalAggregatesById
    )
    if (!source || !target) {
      unresolvedRouteIds.push(route.id)
      continue
    }
    projected.push({
      id: route.id,
      workflowNodeUuid: route.workflowNodeUuid,
      label: route.label,
      sourceOwnerMaterialId: source.ownerMaterialId,
      sourceSiteId: source.siteId,
      sourceSiteKey: source.siteKey,
      targetOwnerMaterialId: target.ownerMaterialId,
      targetSiteId: target.siteId,
      targetSiteKey: target.siteKey,
      executorId: route.executorId,
      status: route.status,
      selected: route.selected === true,
      points: orthogonalTransferPath(source.position, target.position)
    })
  }

  return { routes: projected, unresolvedRouteIds }
}

export function orthogonalTransferPath(
  source: Vector3Tuple,
  target: Vector3Tuple
): Vector3Tuple[] {
  const clearanceY = Math.max(source[1], target[1]) + 0.38
  const midpointX = (source[0] + target[0]) / 2
  const points: Vector3Tuple[] = [
    source,
    [source[0], clearanceY, source[2]],
    [midpointX, clearanceY, source[2]],
    [midpointX, clearanceY, target[2]],
    [target[0], clearanceY, target[2]],
    target
  ]
  return points.filter((point, index) =>
    index === 0 || !sameVector(point, points[index - 1] as Vector3Tuple)
  )
}

/**
 * 解析一端转运引用，且只接受稳定物料身份和库位 UUID/`key`。
 *
 * @param endpoint 工作流参数中的物料所有者身份和库位身份。
 * @param aggregatesByIdentity 由物料 UUID 与后端 `sourceIdentity` 建立的索引。
 * @param aggregatesById 用于组合父子放置坐标的规范物料 UUID 索引。
 * @returns 可定位端点；任何身份缺失、显示名称匹配或非根锚点均返回空。
 */
function resolveTransferEndpoint(
  endpoint: MaterialTransferSceneEndpoint,
  aggregatesByIdentity: ReadonlyMap<string, MaterialAggregate>,
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>
): {
  ownerMaterialId: string
  siteId: string
  siteKey: string
  position: Vector3Tuple
} | null {
  const owner = aggregatesByIdentity.get(endpoint.ownerMaterialId)
  if (!owner) return null
  const site = owner.sites.find((candidate) =>
    candidate.id === endpoint.siteKey ||
    candidate.key === endpoint.siteKey
  )
  if (!site || site.anchor.kind !== 'root') return null
  const centerPose = composePoses(
    site.poseInAnchor,
    {
      positionMm: [
        site.sizeMm[0] / 2,
        site.sizeMm[1] / 2,
        site.sizeMm[2] / 2
      ],
      rotationDegXYZ: [0, 0, 0]
    }
  )
  const worldPose = composePoses(
    resolveAggregateWorldPose(owner.material.id, aggregatesById),
    centerPose
  )
  return {
    ownerMaterialId: owner.material.id,
    siteId: site.id,
    siteKey: site.key,
    position: labPoseToPascal(worldPose).position
  }
}

function sameVector(left: Vector3Tuple, right: Vector3Tuple): boolean {
  return left.every((value, index) => value === right[index])
}


