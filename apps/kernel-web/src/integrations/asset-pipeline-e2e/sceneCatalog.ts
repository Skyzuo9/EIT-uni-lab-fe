export const SCENE_CATALOG_SCHEMA = 'lab.workbench_static_scene_fixture/v0'
export const DEFAULT_ASSET_PIPELINE_E2E_CATALOG_PATH =
  '/__asset_pipeline_e2e__/asset-pipeline-e2e-20260824/scene-catalog.json'

const SITE_ID = 'site_unilab'
const BUILDING_ID = 'building_unilab'
const LEVEL_ID = 'level_unilab'
const FORBIDDEN_RUNTIME = [
  'motion',
  'spatialInterlockEnforced',
  'execution'
] as const

export type Vector3Tuple = [number, number, number]

export type AssetPipelineFixtureErrorCode =
  | 'invalid_catalog'
  | 'forbidden_capability'
  | 'path_escape'
  | 'hash_mismatch'
  | 'missing_artifact'

export class AssetPipelineFixtureError extends Error {
  readonly code: AssetPipelineFixtureErrorCode

  constructor(message: string, code: AssetPipelineFixtureErrorCode) {
    super(message)
    this.name = 'AssetPipelineFixtureError'
    this.code = code
  }
}

export interface SceneCatalogAsset {
  id: string
  family: string
  trialRevision: string
  capabilityGrade: string
  bundleUrl: string
  renderUrl: string
  previewTransform: {
    translationM: Vector3Tuple
    rotationQuatXyzw: [number, number, number, number]
    scale: number
    fixtureOnly: true
  }
  expected: {
    display: boolean
    stablePicking: boolean
    motion: false
    spatialInterlockEnforced: false
    execution: false
  }
}

export interface ProjectedFixtureScene {
  nodes: Record<string, unknown>
  rootNodeIds: string[]
  installedPlugins: string[]
}

export interface SceneCatalog {
  schema: typeof SCENE_CATALOG_SCHEMA
  fixtureId: string
  purpose: 'static_workbench_display_and_picking_only'
  candidate: true
  notAWorkCellActivation: true
  sourceFamilyGateSha256: string
  assetCount: number
  safety: {
    motionAllowed: false
    spatialInterlockAllowed: false
    executionAllowed: false
    reason: string
  }
  assets: readonly SceneCatalogAsset[]
}

export interface FixtureEntity {
  sceneEntityId: string
  alias: string
}

export interface ProjectedFixtureAsset {
  id: string
  family: string
  trialRevision: string
  capabilityGrade: string
  bundleUrl: string
  renderUrl: string
  sceneObjectId: string
  expectedGlbSha256?: string
  entities: readonly FixtureEntity[]
}

/**
 * 读取开发态查询参数。只有显式带 `asset-pipeline-e2e` 时才进入夹具页，
 * 生产导航不会加载这份静态 catalog。
 */
export function readAssetPipelineFixtureCatalogUrl(
  search: string
): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (!params.has('asset-pipeline-e2e')) return null
  const value = params.get('asset-pipeline-e2e')?.trim() ?? ''
  if (value === '' || value === '1' || value === 'true') {
    return DEFAULT_ASSET_PIPELINE_E2E_CATALOG_PATH
  }
  return assertSameOriginCatalogPath(value)
}

export function resolveCatalogAssetUrl(
  catalogUrl: string,
  relativeUrl: string
): string {
  const relative = assertRelativeAssetPath(relativeUrl)
  const base = catalogUrl.endsWith('/')
    ? catalogUrl
    : catalogUrl.slice(0, catalogUrl.lastIndexOf('/') + 1)
  return `${base}${relative}`
}

export function parseSceneCatalog(value: unknown): SceneCatalog {
  if (!isRecord(value)) {
    throw new AssetPipelineFixtureError(
      'scene-catalog.json 不是对象',
      'invalid_catalog'
    )
  }
  if (value.schema !== SCENE_CATALOG_SCHEMA) {
    throw new AssetPipelineFixtureError(
      `不支持的 catalog schema: ${String(value.schema)}`,
      'invalid_catalog'
    )
  }
  if (value.notAWorkCellActivation !== true) {
    throw new AssetPipelineFixtureError(
      'scene-catalog 不是 WorkCellActivation；缺少 notAWorkCellActivation',
      'invalid_catalog'
    )
  }
  if (value.candidate !== true) {
    throw new AssetPipelineFixtureError(
      '静态夹具必须显式标记为 candidate',
      'invalid_catalog'
    )
  }
  if (value.purpose !== 'static_workbench_display_and_picking_only') {
    throw new AssetPipelineFixtureError(
      'catalog purpose 必须是 static_workbench_display_and_picking_only',
      'invalid_catalog'
    )
  }
  const safety = isRecord(value.safety) ? value.safety : null
  if (
    !safety ||
    safety.motionAllowed !== false ||
    safety.spatialInterlockAllowed !== false ||
    safety.executionAllowed !== false
  ) {
    throw new AssetPipelineFixtureError(
      'catalog safety 允许了运动、互锁或执行',
      'forbidden_capability'
    )
  }
  if (!Array.isArray(value.assets) || value.assets.length === 0) {
    throw new AssetPipelineFixtureError('catalog 没有资产', 'invalid_catalog')
  }
  const assets = value.assets.map((item, index) => parseCatalogAsset(item, index))
  const ids = new Set(assets.map((asset) => asset.id))
  if (ids.size !== assets.length) {
    throw new AssetPipelineFixtureError('catalog 资产 id 重复', 'invalid_catalog')
  }
  if (
    typeof value.assetCount === 'number' &&
    value.assetCount !== assets.length
  ) {
    throw new AssetPipelineFixtureError(
      'catalog assetCount 与 assets 长度不一致',
      'invalid_catalog'
    )
  }

  return {
    schema: SCENE_CATALOG_SCHEMA,
    fixtureId: requiredText(value.fixtureId, 'fixtureId'),
    purpose: 'static_workbench_display_and_picking_only',
    candidate: true,
    notAWorkCellActivation: true,
    sourceFamilyGateSha256: requiredText(
      value.sourceFamilyGateSha256,
      'sourceFamilyGateSha256'
    ),
    assetCount: assets.length,
    safety: {
      motionAllowed: false,
      spatialInterlockAllowed: false,
      executionAllowed: false,
      reason: requiredText(safety.reason, 'safety.reason')
    },
    assets
  }
}

/**
 * 把通过门禁的静态 catalog 投影为 Pascal `lab-device` 场景图。
 * 不写入 kinematics，也不把 previewTransform 当成现场 base_pose。
 */
export function projectSceneCatalogToGraph(
  catalog: SceneCatalog,
  catalogUrl: string,
  options: { fitSceneRevision?: number } = {}
): {
  scene: ProjectedFixtureScene
  assets: readonly ProjectedFixtureAsset[]
} {
  const projected: ProjectedFixtureAsset[] = catalog.assets.map((asset) => {
    const renderUrl = resolveCatalogAssetUrl(catalogUrl, asset.renderUrl)
    const bundleUrl = resolveCatalogAssetUrl(catalogUrl, asset.bundleUrl)
    return {
      id: asset.id,
      family: asset.family,
      trialRevision: asset.trialRevision,
      capabilityGrade: asset.capabilityGrade,
      bundleUrl,
      renderUrl,
      sceneObjectId: fixtureSceneObjectId(asset.id),
      entities: []
    }
  })

  const nodes: Record<string, unknown> = {}
  const labNodeIds: string[] = []
  for (const [index, asset] of catalog.assets.entries()) {
    const projectedAsset = projected[index]!
    const pose = labPreviewToPascal(
      asset.previewTransform.translationM,
      asset.previewTransform.rotationQuatXyzw
    )
    const id = projectedAsset.sceneObjectId
    nodes[id] = {
      id,
      type: 'lab-device',
      object: 'node',
      name: asset.family,
      parentId: LEVEL_ID,
      visible: true,
      metadata: {},
      materialNodeId: asset.id,
      displayName: asset.family,
      showLabel: true,
      deviceType: 'asset-pipeline-fixture',
      children: [],
      position: pose.position,
      rotation: pose.rotation,
      scale: [
        asset.previewTransform.scale,
        asset.previewTransform.scale,
        asset.previewTransform.scale
      ],
      dimensions: [0.6, 0.5, 0.6],
      materialKind: 'device',
      renderBody: true,
      model: {
        path: projectedAsset.renderUrl,
        format: 'gltf',
        version: asset.trialRevision,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
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
        fixture: true,
        notAWorkCellActivation: true,
        family: asset.family,
        trialRevision: asset.trialRevision,
        capabilityGrade: asset.capabilityGrade,
        bundleUrl: projectedAsset.bundleUrl,
        fixtureOnlyPreviewTransform: true
      }
    }
    labNodeIds.push(id)
  }

  nodes[SITE_ID] = {
    id: SITE_ID,
    type: 'site',
    object: 'node',
    name: 'Asset pipeline fixture',
    parentId: null,
    visible: true,
    children: [BUILDING_ID],
    fitSceneRevision: options.fitSceneRevision ?? 1,
    fitSceneView: 'default',
    fitSceneObjectIds: []
  }
  nodes[BUILDING_ID] = {
    id: BUILDING_ID,
    type: 'building',
    object: 'node',
    name: '静态夹具',
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
    children: labNodeIds,
    materialTransferLayer: null
  }

  return {
    scene: {
      nodes,
      rootNodeIds: [SITE_ID],
      installedPlugins: ['unilab.lab']
    },
    assets: projected
  }
}

export function fixtureSceneObjectId(assetId: string): string {
  return `lab-fixture-${assetId}`
}

export function parseCapabilityDocument(value: unknown, family: string): void {
  if (!isRecord(value)) {
    throw new AssetPipelineFixtureError(
      `${family} capability.json 不是对象`,
      'invalid_catalog'
    )
  }
  const allows = Array.isArray(value.allows) ? value.allows : []
  const forbids = Array.isArray(value.forbids) ? value.forbids : []
  if (allows.includes('motion') || allows.includes('execution')) {
    throw new AssetPipelineFixtureError(
      `${family} capability 允许了禁止项`,
      'forbidden_capability'
    )
  }
  for (const forbidden of ['motion', 'spatial_interlock_enforced', 'execution']) {
    if (!forbids.includes(forbidden)) {
      throw new AssetPipelineFixtureError(
        `${family} 未显式禁止 ${forbidden}`,
        'forbidden_capability'
      )
    }
  }
}

export function parseEntityRegistry(value: unknown): FixtureEntity[] {
  if (!isRecord(value) || !Array.isArray(value.entities)) return []
  return value.entities.flatMap((item) => {
    if (!isRecord(item) || typeof item.scene_entity_id !== 'string') return []
    const alias =
      (typeof item.link_alias === 'string' && item.link_alias) ||
      (typeof item.cad_occurrence_alias === 'string' && item.cad_occurrence_alias) ||
      item.scene_entity_id
    return [{ sceneEntityId: item.scene_entity_id, alias }]
  })
}

export function readExpectedGlbSha256(bundle: unknown): string | undefined {
  if (!isRecord(bundle) || !Array.isArray(bundle.artifacts)) return undefined
  const glb = bundle.artifacts.find((item) =>
    isRecord(item) && item.path === 'render-lod0.glb'
  )
  return isRecord(glb) && typeof glb.sha256 === 'string' ? glb.sha256 : undefined
}

function parseCatalogAsset(value: unknown, index: number): SceneCatalogAsset {
  if (!isRecord(value)) {
    throw new AssetPipelineFixtureError(
      `assets[${index}] 不是对象`,
      'invalid_catalog'
    )
  }
  const transform = isRecord(value.previewTransform) ? value.previewTransform : null
  if (!transform || transform.fixtureOnly !== true) {
    throw new AssetPipelineFixtureError(
      `${String(value.id)} 的 previewTransform 必须标记 fixtureOnly`,
      'invalid_catalog'
    )
  }
  const expected = isRecord(value.expected) ? value.expected : null
  if (!expected) {
    throw new AssetPipelineFixtureError(
      `${String(value.id)} 缺少 expected 能力边界`,
      'invalid_catalog'
    )
  }
  for (const key of FORBIDDEN_RUNTIME) {
    if (expected[key] !== false) {
      throw new AssetPipelineFixtureError(
        `${String(value.id)} expected.${key} 必须为 false`,
        'forbidden_capability'
      )
    }
  }
  const scale = transform.scale
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    throw new AssetPipelineFixtureError(
      `${String(value.id)} previewTransform.scale 无效`,
      'invalid_catalog'
    )
  }
  return {
    id: requiredText(value.id, `assets[${index}].id`),
    family: requiredText(value.family, `assets[${index}].family`),
    trialRevision: requiredText(
      value.trialRevision,
      `assets[${index}].trialRevision`
    ),
    capabilityGrade: requiredText(
      value.capabilityGrade,
      `assets[${index}].capabilityGrade`
    ),
    bundleUrl: assertRelativeAssetPath(
      requiredText(value.bundleUrl, `assets[${index}].bundleUrl`)
    ),
    renderUrl: assertRelativeAssetPath(
      requiredText(value.renderUrl, `assets[${index}].renderUrl`)
    ),
    previewTransform: {
      translationM: tuple3(transform.translationM, `${String(value.id)}.translationM`),
      rotationQuatXyzw: tuple4(
        transform.rotationQuatXyzw,
        `${String(value.id)}.rotationQuatXyzw`
      ),
      scale,
      fixtureOnly: true
    },
    expected: {
      display: expected.display === true,
      stablePicking: expected.stablePicking === true,
      motion: false,
      spatialInterlockEnforced: false,
      execution: false
    }
  }
}

function assertSameOriginCatalogPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('..')) {
    throw new AssetPipelineFixtureError(
      'catalog URL 必须是不含 .. 的同源绝对路径',
      'path_escape'
    )
  }
  return value
}

function assertRelativeAssetPath(value: string): string {
  if (
    value.startsWith('/') ||
    value.includes('://') ||
    value.split(/[\\/]/).includes('..')
  ) {
    throw new AssetPipelineFixtureError(
      `拒绝路径穿越或绝对 URL: ${value}`,
      'path_escape'
    )
  }
  return value
}

function labPreviewToPascal(
  translationM: Vector3Tuple,
  quaternionXyzw: readonly [number, number, number, number]
): { position: Vector3Tuple; rotation: Vector3Tuple } {
  const [x, y, z] = translationM
  return {
    position: [clean(x), clean(z), clean(-y)],
    rotation: quatXyzwToPascalEuler(quaternionXyzw)
  }
}

function quatXyzwToPascalEuler(
  quaternion: readonly [number, number, number, number]
): Vector3Tuple {
  const [qx, qy, qz, qw] = quaternion
  if (
    Math.abs(qx) < 1e-10 &&
    Math.abs(qy) < 1e-10 &&
    Math.abs(qz) < 1e-10 &&
    Math.abs(Math.abs(qw) - 1) < 1e-10
  ) {
    return [0, 0, 0]
  }
  const labDeg = quatXyzwToEulerDeg(quaternion)
  return [
    clean((labDeg[0] * Math.PI) / 180),
    clean((labDeg[2] * Math.PI) / 180),
    clean((-labDeg[1] * Math.PI) / 180)
  ]
}

function quatXyzwToEulerDeg(
  quaternion: readonly [number, number, number, number]
): Vector3Tuple {
  const [x, y, z, w] = quaternion
  const sinRoll = 2 * (w * x + y * z)
  const cosRoll = 1 - 2 * (x * x + y * y)
  const sinPitch = 2 * (w * y - z * x)
  const sinYaw = 2 * (w * z + x * y)
  const cosYaw = 1 - 2 * (y * y + z * z)
  const pitch = Math.abs(sinPitch) >= 1
    ? Math.sign(sinPitch) * (Math.PI / 2)
    : Math.asin(sinPitch)
  return [
    (Math.atan2(sinRoll, cosRoll) * 180) / Math.PI,
    (pitch * 180) / Math.PI,
    (Math.atan2(sinYaw, cosYaw) * 180) / Math.PI
  ]
}

function clean(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : value
}

function tuple3(value: unknown, field: string): Vector3Tuple {
  if (!Array.isArray(value) || value.length !== 3 || value.some(
    (item) => typeof item !== 'number' || !Number.isFinite(item)
  )) {
    throw new AssetPipelineFixtureError(`${field} 必须是三个有限数字`, 'invalid_catalog')
  }
  return [value[0], value[1], value[2]]
}

function tuple4(
  value: unknown,
  field: string
): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4 || value.some(
    (item) => typeof item !== 'number' || !Number.isFinite(item)
  )) {
    throw new AssetPipelineFixtureError(`${field} 必须是四个有限数字`, 'invalid_catalog')
  }
  return [value[0], value[1], value[2], value[3]]
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AssetPipelineFixtureError(`${field} 不能为空`, 'invalid_catalog')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
