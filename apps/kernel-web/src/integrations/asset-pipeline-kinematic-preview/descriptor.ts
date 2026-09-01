import type { SceneGraph } from '@unilab/pascal-host'

export const KINEMATIC_PREVIEW_SCHEMA = 'lab.kinematic_preview/v1'
export const KINEMATIC_PREVIEW_CATALOG_SCHEMA = 'lab.kinematic_preview_catalog/v0'
export const KINEMATIC_PREVIEW_BACKEND = '/__unilab_backend'
export const KINEMATIC_PREVIEW_CATALOG_URL =
  `${KINEMATIC_PREVIEW_BACKEND}/api/v1/kinematic-preview/catalog`

type Vector3 = [number, number, number]

export interface KinematicPreviewWorkflow {
  id: string
  label: string
  stepCount: number
}

export interface KinematicPreviewDescriptor {
  schema: typeof KINEMATIC_PREVIEW_SCHEMA
  deviceId: string
  materialUuid: string
  displayName: string
  sourceDigest: string
  sourceRelease: {
    archiveName: string
    archiveSha256: string
    repository: string
    exactRef: string
    urdfMember: string
    urdfSha256: string
    archiveReadOnly: true
  }
  model: {
    path: string
    format: 'urdf'
    position: Vector3
    rotation: Vector3
  }
  kinematics: {
    deviceId: string
    topologyDigest: string
    qualifiedJointNames: readonly string[]
    staleAfterSeconds: number
  }
  capability: {
    grade: 'kinematic-preview'
    display: true
    stablePicking: true
    motionPreview: true
    hardwareExecution: false
    spatialInterlockEnforced: false
    reason: string
  }
  workflows: readonly KinematicPreviewWorkflow[]
}

export interface KinematicPreviewCatalog {
  schema: typeof KINEMATIC_PREVIEW_CATALOG_SCHEMA
  robots: readonly KinematicPreviewDescriptor[]
}

export function parseKinematicPreviewCatalog(value: unknown): KinematicPreviewCatalog {
  const root = record(value, 'catalog')
  if (root.schema !== KINEMATIC_PREVIEW_CATALOG_SCHEMA) {
    throw new Error(`不支持的运动预览目录 schema: ${String(root.schema)}`)
  }
  if (!Array.isArray(root.robots) || root.robots.length < 2) {
    throw new Error('运动预览目录必须至少包含两个机器人')
  }
  const robots = root.robots.map(parseKinematicPreviewDescriptor)
  if (new Set(robots.map(robot => robot.deviceId)).size !== robots.length) {
    throw new Error('运动预览目录 device_id 重复')
  }
  return {
    schema: KINEMATIC_PREVIEW_CATALOG_SCHEMA,
    robots
  }
}

export function parseKinematicPreviewDescriptor(
  value: unknown
): KinematicPreviewDescriptor {
  const root = record(value, 'descriptor')
  if (root.schema !== KINEMATIC_PREVIEW_SCHEMA) {
    throw new Error(`不支持的运动预览 schema: ${String(root.schema)}`)
  }
  const model = record(root.model, 'model')
  const kinematics = record(root.kinematics, 'kinematics')
  const capability = record(root.capability, 'capability')
  const sourceRelease = record(root.source_release, 'source_release')
  if (
    capability.grade !== 'kinematic-preview' ||
    capability.display !== true ||
    capability.stable_picking !== true ||
    capability.motion_preview !== true ||
    capability.hardware_execution !== false ||
    capability.spatial_interlock_enforced !== false
  ) {
    throw new Error('运动预览能力边界无效或授予了执行/空间互锁资格')
  }
  if (model.format !== 'urdf') {
    throw new Error('运动预览只接受 Provider 产出的 URDF')
  }
  const modelPath = text(model.path, 'model.path')
  if (!modelPath.startsWith('/api/v1/kinematic-models/')) {
    throw new Error('运动预览模型必须来自 OS kinematic-models 接口')
  }
  const deviceId = text(root.device_id, 'device_id')
  const kinematicDeviceId = text(kinematics.device_id, 'kinematics.device_id')
  if (deviceId !== kinematicDeviceId) {
    throw new Error('descriptor 与 kinematics 的 device_id 不一致')
  }
  const topologyDigest = digest(
    kinematics.topology_digest,
    'kinematics.topology_digest'
  )
  const qualifiedJointNames = textArray(
    kinematics.qualified_joint_names,
    'kinematics.qualified_joint_names'
  )
  if (
    qualifiedJointNames.some(name => !name.startsWith(`${deviceId}_`)) ||
    new Set(qualifiedJointNames).size !== qualifiedJointNames.length
  ) {
    throw new Error('限定关节名与 device_id 不一致或存在重复')
  }
  const staleAfterSeconds = positive(
    kinematics.stale_after_s,
    'kinematics.stale_after_s'
  )
  if (!Array.isArray(root.workflows) || root.workflows.length === 0) {
    throw new Error('运动预览至少需要一条受限工作流')
  }
  const workflows = root.workflows.map((entry, index) => {
    const item = record(entry, `workflows[${index}]`)
    return {
      id: text(item.id, `workflows[${index}].id`),
      label: text(item.label, `workflows[${index}].label`),
      stepCount: positiveInteger(
        item.step_count,
        `workflows[${index}].step_count`
      )
    }
  })
  if (new Set(workflows.map(item => item.id)).size !== workflows.length) {
    throw new Error('运动预览工作流 id 重复')
  }
  const sourceDigest = digest(root.source_digest, 'source_digest')
  const archiveSha256 = digest(
    sourceRelease.archive_sha256,
    'source_release.archive_sha256'
  )
  if (sourceDigest !== archiveSha256 || sourceRelease.archive_read_only !== true) {
    throw new Error('SourceRelease 必须是与 source_digest 一致的只读 ZIP')
  }
  return {
    schema: KINEMATIC_PREVIEW_SCHEMA,
    deviceId,
    materialUuid: text(root.material_uuid, 'material_uuid'),
    displayName: text(root.display_name, 'display_name'),
    sourceDigest,
    sourceRelease: {
      archiveName: text(sourceRelease.archive_name, 'source_release.archive_name'),
      archiveSha256,
      repository: text(sourceRelease.repository, 'source_release.repository'),
      exactRef: text(sourceRelease.exact_ref, 'source_release.exact_ref'),
      urdfMember: text(sourceRelease.urdf_member, 'source_release.urdf_member'),
      urdfSha256: digest(sourceRelease.urdf_sha256, 'source_release.urdf_sha256'),
      archiveReadOnly: true
    },
    model: {
      path: `${KINEMATIC_PREVIEW_BACKEND}${modelPath}`,
      format: 'urdf',
      position: vector(model.position, 'model.position'),
      rotation: vector(model.rotation, 'model.rotation')
    },
    kinematics: {
      deviceId,
      topologyDigest,
      qualifiedJointNames,
      staleAfterSeconds
    },
    capability: {
      grade: 'kinematic-preview',
      display: true,
      stablePicking: true,
      motionPreview: true,
      hardwareExecution: false,
      spatialInterlockEnforced: false,
      reason: text(capability.reason, 'capability.reason')
    },
    workflows
  }
}

export function projectKinematicPreviewScene(
  descriptor: KinematicPreviewDescriptor,
  fitSceneRevision = 1
): SceneGraph {
  const deviceNodeId = `kinematic-preview-${descriptor.deviceId}`
  return {
    nodes: {
      site_unilab: {
        id: 'site_unilab',
        type: 'site',
        object: 'node',
        name: `${descriptor.displayName} kinematic preview`,
        parentId: null,
        visible: true,
        children: ['building_unilab'],
        fitSceneRevision,
        fitSceneView: 'default',
        fitSceneObjectIds: [deviceNodeId]
      },
      building_unilab: {
        id: 'building_unilab',
        type: 'building',
        object: 'node',
        name: '运动预览',
        parentId: 'site_unilab',
        visible: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        children: ['level_unilab']
      },
      level_unilab: {
        id: 'level_unilab',
        type: 'level',
        object: 'node',
        name: 'Lab floor',
        parentId: 'building_unilab',
        visible: true,
        level: 0,
        children: [deviceNodeId],
        materialTransferLayer: null
      },
      [deviceNodeId]: {
        id: deviceNodeId,
        type: 'lab-device',
        object: 'node',
        name: descriptor.displayName,
        parentId: 'level_unilab',
        visible: true,
        metadata: {},
        materialNodeId: descriptor.materialUuid,
        displayName: descriptor.displayName,
        showLabel: true,
        deviceType: 'robot-arm',
        templateUuid: '',
        rosDeviceName: descriptor.deviceId,
        children: [],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        dimensions: [1.2, 1.2, 1.5],
        materialKind: 'device',
        renderBody: true,
        kinematics: descriptor.kinematics,
        model: {
          ...descriptor.model,
          version: descriptor.sourceDigest,
          attachPoints: []
        },
        attach: {
          parentDeviceId: null,
          parentLinkName: null,
          mountPoint: null
        },
        placementRef: {
          kind: 'world',
          parentMaterialId: null,
          siteId: null,
          anchorKind: 'root',
          anchorLinkName: null
        },
        graphMeta: {
          capabilityGrade: descriptor.capability.grade,
          motionPreviewOnly: true,
          hardwareExecution: false,
          spatialInterlockEnforced: false
        }
      }
    },
    rootNodeIds: ['site_unilab'],
    installedPlugins: ['unilab.lab']
  } as SceneGraph
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} 必须是非空文本`)
  }
  return value.trim()
}

function digest(value: unknown, field: string): string {
  const result = text(value, field)
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw new Error(`${field} 必须是 SHA-256`)
  }
  return result
}

function textArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} 必须是非空数组`)
  }
  return value.map((item, index) => text(item, `${field}[${index}]`))
}

function vector(value: unknown, field: string): Vector3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some(item => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    throw new Error(`${field} 必须是三个有限数`)
  }
  return value as Vector3
}

function positive(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} 必须是正有限数`)
  }
  return value
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} 必须是正整数`)
  }
  return value
}
