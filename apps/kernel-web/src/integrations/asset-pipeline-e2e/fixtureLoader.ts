import {
  AssetPipelineFixtureError,
  parseCapabilityDocument,
  parseEntityRegistry,
  parseSceneCatalog,
  projectSceneCatalogToGraph,
  readExpectedGlbSha256,
  resolveCatalogAssetUrl,
  type ProjectedFixtureAsset,
  type ProjectedFixtureScene,
  type SceneCatalog
} from './sceneCatalog'

export interface FixtureIO {
  fetch: (url: string) => Promise<Response>
  sha256Hex: (data: ArrayBuffer) => Promise<string>
}

export interface LoadedAssetPipelineFixture {
  catalog: SceneCatalog
  catalogUrl: string
  scene: ProjectedFixtureScene
  assets: readonly ProjectedFixtureAsset[]
  assetFailures: Readonly<Record<string, string>>
}

export const defaultFixtureIO: FixtureIO = {
  fetch: (url) => globalThis.fetch(url),
  sha256Hex: sha256Hex
}

/**
 * 拉取并校验静态 scene-catalog。catalog 本身失败则整页失败；
 * 单个 GLB 缺失只记录到该资产，避免拖垮其余模型。
 */
export async function loadAssetPipelineFixture(
  catalogUrl: string,
  io: FixtureIO = defaultFixtureIO
): Promise<LoadedAssetPipelineFixture> {
  const catalog = parseSceneCatalog(
    await readJson(catalogUrl, io, 'scene-catalog.json')
  )
  const projected = projectSceneCatalogToGraph(catalog, catalogUrl)
  const assets: ProjectedFixtureAsset[] = []
  const assetFailures: Record<string, string> = {}
  const nodes = { ...projected.scene.nodes }

  for (const asset of projected.assets) {
    try {
      const verified = await verifyFixtureAsset(asset, io)
      assets.push(verified)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (isMissingGlb(cause, message)) {
        assetFailures[asset.id] = message
        assets.push(asset)
        continue
      }
      throw cause
    }
  }

  return {
    catalog,
    catalogUrl,
    scene: {
      ...projected.scene,
      nodes
    },
    assets,
    assetFailures
  }
}

async function verifyFixtureAsset(
  asset: ProjectedFixtureAsset,
  io: FixtureIO
): Promise<ProjectedFixtureAsset> {
  const bundle = await readJson(asset.bundleUrl, io, `${asset.family} bundle.json`)
  if (
    !isRecord(bundle) ||
    bundle.schema !== 'lab.family_sim_bundle/v0' ||
    bundle.family !== asset.family
  ) {
    throw new AssetPipelineFixtureError(
      `${asset.family} bundle 与 catalog family 不一致`,
      'invalid_catalog'
    )
  }
  await verifyBundleArtifacts(bundle, asset.bundleUrl, io)
  parseCapabilityDocument(
    await readJson(
      resolveCatalogAssetUrl(asset.bundleUrl, 'capability.json'),
      io,
      `${asset.family} capability.json`
    ),
    asset.family
  )
  const registryUrl = resolveCatalogAssetUrl(
    asset.bundleUrl,
    'entity-registry.json'
  )
  const entities = parseEntityRegistry(
    await readJson(registryUrl, io, `${asset.family} entity-registry.json`)
  )
  const expectedGlbSha256 = readExpectedGlbSha256(bundle)
  if (expectedGlbSha256) {
    await verifyGlbHash(asset.renderUrl, expectedGlbSha256, io, asset.family)
  }
  return { ...asset, expectedGlbSha256, entities }
}

async function verifyBundleArtifacts(
  bundle: Record<string, unknown>,
  bundleUrl: string,
  io: FixtureIO
): Promise<void> {
  const artifacts = Array.isArray(bundle.artifacts) ? bundle.artifacts : []
  for (const artifact of artifacts) {
    if (!isRecord(artifact) || typeof artifact.path !== 'string') continue
    if (artifact.path === 'render-lod0.glb') continue
    if (typeof artifact.sha256 !== 'string') continue
    const url = resolveCatalogAssetUrl(bundleUrl, artifact.path)
    const response = await io.fetch(url)
    if (!response.ok) {
      throw new AssetPipelineFixtureError(
        `缺少 bundle 产物 ${artifact.path}（HTTP ${response.status}）`,
        'missing_artifact'
      )
    }
    const digest = await io.sha256Hex(await response.arrayBuffer())
    if (digest !== artifact.sha256) {
      throw new AssetPipelineFixtureError(
        `${artifact.path} SHA-256 与 bundle 清单不一致`,
        'hash_mismatch'
      )
    }
  }
}

async function verifyGlbHash(
  url: string,
  expected: string,
  io: FixtureIO,
  family: string
): Promise<void> {
  const response = await io.fetch(url)
  if (!response.ok) {
    throw Object.assign(
      new AssetPipelineFixtureError(
        `${family} GLB 无法读取（HTTP ${response.status}）: ${url}`,
        'missing_artifact'
      ),
      { missingGlb: true }
    )
  }
  const digest = await io.sha256Hex(await response.arrayBuffer())
  if (digest !== expected) {
    throw new AssetPipelineFixtureError(
      `${family} render-lod0.glb 哈希漂移`,
      'hash_mismatch'
    )
  }
}

async function readJson(
  url: string,
  io: FixtureIO,
  label: string
): Promise<unknown> {
  const response = await io.fetch(url)
  const text = await response.text()
  if (!response.ok) {
    throw new AssetPipelineFixtureError(
      `无法读取 ${label}（HTTP ${response.status}）`,
      response.status === 404 ? 'missing_artifact' : 'invalid_catalog'
    )
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AssetPipelineFixtureError(
      `${label} 不是 JSON（HTTP ${response.status}）`,
      'invalid_catalog'
    )
  }
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function isMissingGlb(cause: unknown, message: string): boolean {
  return (
    (cause instanceof AssetPipelineFixtureError &&
      cause.code === 'missing_artifact' &&
      (cause as { missingGlb?: boolean }).missingGlb === true) ||
    message.includes('GLB 无法读取')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
