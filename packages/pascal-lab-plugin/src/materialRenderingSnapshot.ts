import type { MaterialAggregate } from '@unilab/material/domain'
import type { MaterialRenderingSnapshot } from './materialAggregateSceneTypes'
import type { LabAttachPoint } from './schema'
import { inferModelFormat } from './modelFormat'
import { labPoseToPascal } from './units'
import {
  finiteNumber,
  optionalNumber,
  optionalString,
  pairTuple,
  readRecord,
  recordValue,
  stringArray,
  stringValue,
  vectorTuple
} from './materialSceneWire'

export function readMaterialRendering(
  aggregate: MaterialAggregate
): MaterialRenderingSnapshot {
  const config = readRecord(aggregate.material.config)
  const source = recordValue(config.rendering) ?? config
  const model = recordValue(source.model) ?? {}
  const kinematics = readKinematics(recordValue(source.kinematics))
  const pose = recordValue(source.pose) ?? {}
  const size = recordValue(pose.size) ?? {}
  const kind = stringValue(
    source.kind ?? source.type ?? source.resourceType,
    'custom'
  ).toLowerCase()
  const materialKind = (
    source.materialKind ?? source.material_kind
  ) === 'resource'
    ? 'resource'
    : 'device'

  const dimensionsMm =
    vectorTuple(source.dimensionsMm ?? source.sizeMm) ??
    vectorTuple(config.dimensionsMm ?? config.sizeMm) ??
    readBackendDimensions(config) ??
    [
      finiteNumber(size.width, kind === 'table' ? 1500 : 600),
      finiteNumber(size.height, kind === 'table' ? 900 : 500),
      finiteNumber(size.depth, kind === 'table' ? 750 : 600)
    ]
  const footprintMm =
    pairTuple(source.footprintMm) ??
    [dimensionsMm[0], dimensionsMm[2]]
  const modelPath = stringValue(model.path ?? model.mesh)
  const modelFormat = optionalString(model.format ?? model.model_type)
  const modelPosition = vectorTuple(model.position) ?? [0, 0, 0]
  const modelRotation = vectorTuple(model.rotation) ?? [0, 0, 0]
  const sceneContext = readSceneContext(
    model,
    modelPath,
    modelFormat,
    modelPosition,
    modelRotation
  )

  return {
    kind: kind === 'lab-table' || kind === 'workbench' ? 'table' : kind,
    materialKind,
    dimensionsMm,
    footprintMm,
    scale: vectorTuple(source.scale) ?? [1, 1, 1],
    ...(kinematics ? { kinematics } : {}),
    ...(sceneContext ? { sceneContext } : {}),
    model: {
      path: modelPath,
      format: modelFormat,
      meshDir: optionalString(model.meshDir ?? model.mesh),
      macro: optionalString(model.macro),
      ossDir: optionalString(model.ossDir ?? model.oss_dir),
      version: optionalString(model.version),
      type: optionalString(model.type),
      color: optionalString(model.color),
      selector: readGltfSelector(recordValue(model.selector)),
      position: modelPosition,
      rotation: modelRotation,
      attachPoints: readAttachPoints(model, aggregate),
      instances: readModelInstances(model, aggregate)
    }
  }
}

/** 读取共享 GLB 声明中的只读场景上下文；非法或非 GLB 描述关闭式忽略。 */
function readSceneContext(
  model: Record<string, unknown>,
  path: string,
  format: string | undefined,
  position: MaterialRenderingSnapshot['model']['position'],
  rotation: MaterialRenderingSnapshot['model']['rotation']
): MaterialRenderingSnapshot['sceneContext'] {
  const origin = recordValue(model.modelOrigin ?? model.model_origin)
  const source = recordValue(origin?.sceneContext ?? origin?.scene_context)
  if (!source || !path || format?.toLowerCase() !== 'glb') return undefined
  const id = optionalString(source.id)
  const coordinateAuthority = optionalString(
    source.coordinateAuthority ?? source.coordinate_authority
  )
  const mode = optionalString(source.mode)
  const rawSelectors = Array.isArray(source.selectors) ? source.selectors : []
  const selectors = rawSelectors
    .map(value => readGltfSelector(recordValue(value)))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
  if (
    !id ||
    !coordinateAuthority ||
    mode !== 'static-read-only' ||
    selectors.length !== rawSelectors.length ||
    selectors.length === 0 ||
    new Set(selectors.map(selector => selector.nodePath)).size !== selectors.length
  ) return undefined
  return {
    id,
    coordinateAuthority,
    mode,
    models: selectors.map(selector => ({
      path,
      format: 'gltf',
      selector,
      position,
      rotation
    }))
  }
}

function readGltfSelector(
  source: Record<string, unknown> | undefined
): MaterialRenderingSnapshot['model']['selector'] {
  if (!source || source.kind !== 'gltf_subtree') return undefined
  const nodeIndex = optionalNumber(source.nodeIndex ?? source.node_index)
  const nodePath = optionalString(source.nodePath ?? source.node_path)
  const rootTransform = optionalString(
    source.rootTransform ?? source.root_transform
  )
  const excludeNodePaths = stringArray(
    source.excludeNodePaths ?? source.exclude_node_paths
  ) ?? []
  if (
    nodeIndex == null ||
    !Number.isInteger(nodeIndex) ||
    nodeIndex < 0 ||
    !nodePath ||
    new Set(excludeNodePaths).size !== excludeNodePaths.length ||
    excludeNodePaths.some(
      (candidate) =>
        candidate === nodePath || !candidate.startsWith(`${nodePath}/`)
    ) ||
    !['preserve', 'reset_translation', 'identity'].includes(
      rootTransform ?? 'reset_translation'
    )
  ) {
    return undefined
  }
  return {
    kind: 'gltf_subtree',
    nodeIndex,
    nodePath,
    rootTransform: (rootTransform ?? 'reset_translation') as
      | 'preserve'
      | 'reset_translation'
      | 'identity',
    excludeNodePaths
  }
}

/**
 * The Backend material API describes its Z-up scene as X/Y/Z, where X and Y
 * form the floor plane and Z is height. Pascal uses X/Y/Z as width, height and
 * depth, so the two horizontal axes must be projected as X/Z.
 */
function readBackendDimensions(
  config: Record<string, unknown>
): MaterialRenderingSnapshot['dimensionsMm'] | undefined {
  const sizeX = optionalNumber(config.size_x ?? config.sizeX)
  const sizeY = optionalNumber(config.size_y ?? config.sizeY)
  const sizeZ = optionalNumber(config.size_z ?? config.sizeZ)

  return sizeX == null || sizeY == null || sizeZ == null
    ? undefined
    : [sizeX, sizeZ, sizeY]
}

function readKinematics(
  source: Record<string, unknown> | undefined
): MaterialRenderingSnapshot['kinematics'] {
  if (!source) return undefined
  const deviceId = optionalString(source.device_id)
  const topologyDigest = optionalString(source.topology_digest)
  const qualifiedJointNames = stringArray(source.qualified_joint_names)
  const staleAfterSeconds = optionalNumber(source.stale_after_s)
  if (!deviceId || !topologyDigest ||
      !/^[0-9a-f]{64}$/u.test(topologyDigest) ||
      !qualifiedJointNames || qualifiedJointNames.length === 0 ||
      qualifiedJointNames.some(name => !name.trim()) ||
      new Set(qualifiedJointNames).size !== qualifiedJointNames.length ||
      staleAfterSeconds == null || staleAfterSeconds <= 0) return undefined
  return {
    deviceId,
    topologyDigest,
    qualifiedJointNames,
    staleAfterSeconds
  }
}

function readModelInstances(
  model: Record<string, unknown>,
  aggregate: MaterialAggregate
): MaterialRenderingSnapshot['model']['instances'] {
  const source = recordValue(model.instances)
  if (!source) return undefined
  const path = optionalString(source.path)
  if (!path) return undefined
  const siteKinds = stringArray(source.siteKinds) ?? []
  const visibleStates = stringArray(source.visibleStates) ?? []
  const items = aggregate.sites
    .filter(
      (site) =>
        site.visible !== false &&
        (siteKinds.length === 0 ||
          (site.kind != null && siteKinds.includes(site.kind))) &&
        (visibleStates.length === 0 ||
          (site.visual != null &&
            visibleStates.includes(site.visual.state)))
    )
    .map((site) => {
      const pose = labPoseToPascal(site.poseInAnchor)
      return {
        id: site.id,
        position: pose.position,
        rotation: pose.rotation
      }
    })
  return {
    path,
    format: inferModelFormat(path, optionalString(source.format)),
    color: optionalString(source.color),
    position: vectorTuple(source.position) ?? [0, 0, 0],
    rotation: vectorTuple(source.rotation) ?? [0, 0, 0],
    items
  }
}


function readAttachPoints(
  model: Record<string, unknown>,
  aggregate: MaterialAggregate
): LabAttachPoint[] {
  const points = new Map<string, LabAttachPoint>()
  const rawPoints = Array.isArray(model.attachPoints)
    ? model.attachPoints
    : Array.isArray(model.attach_points)
      ? model.attach_points
      : []

  for (const value of rawPoints) {
    const point = recordValue(value)
    if (!point) continue
    const link = optionalString(point.link)
    if (!link) continue
    points.set(link, {
      link,
      label: optionalString(point.label),
      row: optionalNumber(point.row),
      col: optionalNumber(point.col),
      acceptTypes: stringArray(point.acceptTypes ?? point.accept_types),
      position: vectorTuple(point.position),
      rotation: vectorTuple(point.rotation)
    })
  }

  for (const site of aggregate.sites) {
    if (site.anchor.kind !== 'link') continue
    points.set(site.anchor.linkName, {
      link: site.anchor.linkName,
      label: site.name,
      acceptTypes: [...site.allowedTemplateIds],
      position: [...site.poseInAnchor.positionMm],
      rotation: [...site.poseInAnchor.rotationDegXYZ]
    })
  }

  return [...points.values()]
}
