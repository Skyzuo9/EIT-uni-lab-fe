import type { SceneGraph } from '@unilab/pascal-host'

import type {
  LabMaterialNode,
  MaterialNodeUpdate,
  MaterialVector3
} from './material'
import {
  LabDeviceNodeSchema,
  LabTableNodeSchema,
  isLabDeviceNode,
  isLabTableNode,
  type LabAttachPoint
} from './schema'
import {
  mountedPoseToPascal,
  pascalPoseToMounted,
  pascalPoseToTopLevel,
  topLevelPoseToPascal,
  type Vector3Tuple
} from './units'

const SITE_ID = 'site_unilab'
const BUILDING_ID = 'building_unilab'
const LEVEL_ID = 'level_unilab'

function tuple(value?: MaterialVector3, fallback = 0): Vector3Tuple {
  return [
    value?.x ?? fallback,
    value?.y ?? fallback,
    value?.z ?? fallback
  ]
}

export function inferModelFormat(
  path: string | undefined,
  backendFormat: string | undefined
): 'xacro' | 'urdf' | 'gltf' | 'stl' | 'fbx' | 'obj' {
  const extension = path?.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase()
  if (extension === 'xacro') return 'xacro'
  if (extension === 'urdf') return 'urdf'
  if (extension === 'stl') return 'stl'
  if (extension === 'fbx') return 'fbx'
  if (extension === 'obj') return 'obj'
  if (extension === 'glb' || extension === 'gltf') return 'gltf'
  if (
    backendFormat === 'xacro' ||
    backendFormat === 'urdf' ||
    backendFormat === 'stl' ||
    backendFormat === 'fbx' ||
    backendFormat === 'obj'
  ) {
    return backendFormat
  }
  return 'gltf'
}

function sanitizeRosName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

function resolveAttachPoints(node: LabMaterialNode): LabAttachPoint[] {
  const result = new Map<string, LabAttachPoint>()

  for (const point of node.model?.attach_points ?? []) {
    result.set(point.link, {
      link: point.link,
      label: point.label,
      row: point.row,
      col: point.col,
      acceptTypes: point.accept_types ? [...point.accept_types] : undefined,
      position: point.position ? [...point.position] : undefined,
      rotation: point.rotation ? [...point.rotation] : undefined
    })
  }

  for (const site of node.init_param_data?.sites ?? []) {
    if (!site.parent_link) continue
    result.set(site.parent_link, {
      link: site.parent_link,
      label: site.label,
      acceptTypes: site.content_type?.map(String),
      position: tuple(site.position),
      rotation: tuple(site.rotation)
    })
  }

  return [...result.values()]
}

function resolveDimensions(node: LabMaterialNode): Vector3Tuple {
  const size = node.pose?.size
  return [
    Math.max((size?.width ?? 600) / 1000, 0.01),
    Math.max((size?.height ?? 500) / 1000, 0.01),
    Math.max((size?.depth ?? 600) / 1000, 0.01)
  ]
}

function hasRenderableShape(node: LabMaterialNode): boolean {
  if (node.model?.path || node.model?.mesh) return true
  const size = node.pose?.size
  return Boolean(
    node.pose?.position_3d &&
      size?.width &&
      size.height &&
      size.depth
  )
}

function isTable(node: LabMaterialNode): boolean {
  const type = node.type?.toLowerCase()
  return type === 'table' || type === 'lab-table' || type === 'workbench'
}

export function materialNodesToSceneGraph(
  materialNodes: readonly LabMaterialNode[]
): SceneGraph {
  const nodes: Record<string, unknown> = {}
  const labNodeIds: string[] = []

  for (const materialNode of materialNodes) {
    if (!materialNode.uuid || !hasRenderableShape(materialNode)) continue

    const id = isTable(materialNode)
      ? `lab-table-${materialNode.uuid}`
      : `lab-${materialNode.uuid}`
    const isMounted = Boolean(materialNode.parent_uuid)
    const pose = isMounted
      ? mountedPoseToPascal(
          tuple(materialNode.pose?.position),
          tuple(materialNode.pose?.rotation)
        )
      : topLevelPoseToPascal(
          tuple(materialNode.pose?.position),
          tuple(materialNode.pose?.rotation)
        )

    if (isTable(materialNode)) {
      nodes[id] = LabTableNodeSchema.parse({
        id,
        type: 'lab-table',
        parentId: LEVEL_ID,
        materialNodeId: materialNode.uuid,
        displayName:
          materialNode.display_name ?? materialNode.name ?? '工作台',
        position: pose.position,
        rotation: pose.rotation,
        dimensions: resolveDimensions(materialNode),
        graphMeta: materialNode.data ?? undefined
      })
    } else {
      nodes[id] = LabDeviceNodeSchema.parse({
        id,
        type: 'lab-device',
        parentId: LEVEL_ID,
        materialNodeId: materialNode.uuid,
        displayName:
          materialNode.display_name ?? materialNode.name ?? materialNode.uuid,
        deviceType: materialNode.type ?? 'custom',
        templateUuid: materialNode.res_template_uuid ?? '',
        rosDeviceName: sanitizeRosName(materialNode.name ?? ''),
        position: pose.position,
        rotation: pose.rotation,
        scale: tuple(materialNode.pose?.scale, 1),
        dimensions: resolveDimensions(materialNode),
        model: {
          path: materialNode.model?.path ?? materialNode.model?.mesh ?? '',
          format: inferModelFormat(
            materialNode.model?.path ?? materialNode.model?.mesh,
            materialNode.model?.format ?? materialNode.model?.model_type
          ),
          meshDir: materialNode.model?.mesh,
          ossDir: materialNode.model?.oss_dir,
          version: materialNode.model?.version,
          type: materialNode.model?.type,
          attachPoints: resolveAttachPoints(materialNode)
        },
        attach: {
          parentDeviceId: materialNode.parent_uuid
            ? `lab-${materialNode.parent_uuid}`
            : null,
          parentLinkName:
            materialNode.pose?.extra?.parent_link ??
            materialNode.pose?.parent_link ??
            (typeof materialNode.data?._mount_parent_link === 'string'
              ? materialNode.data._mount_parent_link
              : null),
          mountPoint:
            materialNode.pose?.extra?.mount_point ??
            materialNode.pose?.mount_point ??
            null
        },
        graphMeta: materialNode.data ?? undefined
      })
    }

    labNodeIds.push(id)
  }

  nodes[SITE_ID] = {
    id: SITE_ID,
    type: 'site',
    object: 'node',
    name: 'Uni-Lab',
    parentId: null,
    visible: true,
    children: [BUILDING_ID]
  }
  nodes[BUILDING_ID] = {
    id: BUILDING_ID,
    type: 'building',
    object: 'node',
    name: 'Laboratory',
    parentId: SITE_ID,
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [LEVEL_ID]
  }
  nodes[LEVEL_ID] = {
    id: LEVEL_ID,
    type: 'level',
    object: 'node',
    name: 'Lab floor',
    parentId: BUILDING_ID,
    visible: true,
    level: 0,
    children: labNodeIds
  }

  return {
    nodes,
    rootNodeIds: [SITE_ID],
    installedPlugins: ['unilab.lab']
  }
}

function vectorRecord(value: Vector3Tuple): MaterialVector3 {
  return { x: value[0], y: value[1], z: value[2] }
}

export function sceneGraphToMaterialUpdates(
  scene: SceneGraph
): MaterialNodeUpdate[] {
  const updates: MaterialNodeUpdate[] = []

  for (const value of Object.values(scene.nodes)) {
    if (!isLabDeviceNode(value) && !isLabTableNode(value)) continue
    if (!value.materialNodeId) continue

    const isMounted =
      isLabDeviceNode(value) && Boolean(value.attach.parentDeviceId)
    const pose = isMounted
      ? pascalPoseToMounted(value.position, value.rotation)
      : pascalPoseToTopLevel(value.position, value.rotation)

    updates.push({
      uuid: value.materialNodeId,
      changes: {
        pose: {
          position: vectorRecord(pose.position),
          rotation: vectorRecord(pose.rotation),
          ...(isLabDeviceNode(value)
            ? {
                scale: vectorRecord(value.scale),
                parent_link: value.attach.parentLinkName ?? undefined,
                mount_point: value.attach.mountPoint ?? undefined,
                extra: {
                  parent_link: value.attach.parentLinkName ?? '',
                  mount_point: value.attach.mountPoint ?? ''
                }
              }
            : {})
        },
        ...(isLabDeviceNode(value)
          ? {
              parent_uuid: value.attach.parentDeviceId
                ? value.attach.parentDeviceId.replace(/^lab-/, '')
                : ''
            }
          : {})
      }
    })
  }

  return updates
}
