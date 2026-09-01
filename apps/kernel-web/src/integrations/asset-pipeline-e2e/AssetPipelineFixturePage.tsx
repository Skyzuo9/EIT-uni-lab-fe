import { PascalEditorHost, type SceneGraph } from '@unilab/pascal-host'
import {
  isLabDeviceNode,
  preparePascalLabPlugin
} from '@unilab/pascal-lab-plugin'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { supportsWebGl } from '../lab-workbench/webGlCapability'
import { loadAssetPipelineFixture } from './fixtureLoader'
import {
  AssetPipelineFixtureError,
  readAssetPipelineFixtureCatalogUrl,
  type ProjectedFixtureAsset
} from './sceneCatalog'
import styles from './AssetPipelineFixturePage.module.scss'

/**
 * 开发态入口：用现有 Pascal renderer 加载静态 scene-catalog。
 * 不是物料图，也不是 WorkCellActivation；默认生产导航不会进入此页。
 */
export function AssetPipelineFixturePage(): React.JSX.Element {
  const catalogUrl = useMemo(
    () => readAssetPipelineFixtureCatalogUrl(window.location.search),
    []
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fixture, setFixture] = useState<Awaited<
    ReturnType<typeof loadAssetPipelineFixture>
  > | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [fitSceneRevision, setFitSceneRevision] = useState(1)

  useEffect(() => {
    if (!catalogUrl) {
      setError('缺少 asset-pipeline-e2e catalog URL')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void loadAssetPipelineFixture(catalogUrl)
      .then((loaded) => {
        if (!cancelled) {
          setFixture(loaded)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        const message = cause instanceof AssetPipelineFixtureError
          ? `${cause.code}: ${cause.message}`
          : cause instanceof Error
            ? cause.message
            : String(cause)
        setError(message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [catalogUrl])

  const scene = useMemo(() => {
    if (!fixture) return null
    const site = fixture.scene.nodes.site_unilab
    if (!site || typeof site !== 'object') return fixture.scene
    return {
      ...fixture.scene,
      nodes: {
        ...fixture.scene.nodes,
        site_unilab: {
          ...site,
          fitSceneRevision
        }
      }
    }
  }, [fitSceneRevision, fixture])

  const selectedAsset = useMemo(
    () => fixture?.assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [fixture, selectedAssetId]
  )

  const prepare = useCallback(async () => {
    await preparePascalLabPlugin()
  }, [])

  const handleSelectionChange = useCallback(
    (sceneObjectIds: readonly string[]) => {
      if (!fixture) return
      const selected = sceneObjectIds.flatMap((id) => {
        const node = fixture.scene.nodes[id]
        return isLabDeviceNode(node) ? [node.materialNodeId] : []
      })
      setSelectedAssetId(selected[0] ?? null)
    },
    [fixture]
  )

  if (!supportsWebGl()) {
    return (
      <main className={styles.page}>
        <Banner />
        <p className={styles.error}>当前浏览器未启用 WebGL。</p>
      </main>
    )
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <Banner />
        <p className={styles.status}>正在加载静态资产夹具…</p>
      </main>
    )
  }

  if (error || !fixture || !scene) {
    return (
      <main className={styles.page}>
        <Banner />
        <p className={styles.error} data-testid="asset-pipeline-e2e-error">
          {error ?? '夹具未加载'}
        </p>
      </main>
    )
  }

  return (
    <main className={styles.page} data-testid="asset-pipeline-e2e-page">
      <Banner />
      <div className={styles.body}>
        <section className={styles.viewport} aria-label="静态资产夹具三维视图">
          <div className="pascal-lab-workbench">
            <div className="pascal-lab-workbench__native">
              <PascalEditorHost
                scene={scene as SceneGraph}
                projectId="asset-pipeline-e2e-fixture"
                prepare={prepare}
                readOnly
                editorViewMode="3d"
                sceneTheme="studio"
                showGrid
                suppressSelectionAfterPointerDrag
                toolbar={
                  <div className="pascal-lab-toolbar">
                    <span className="pascal-lab-toolbar__title">
                      资产管线静态夹具 · Pascal
                    </span>
                    <span className="pascal-lab-toolbar__status">
                      {fixture.assets.length} 个候选 · 只读显示/拾取
                    </span>
                    <div className="pascal-lab-toolbar__actions">
                      <button
                        type="button"
                        className="pascal-lab-toolbar__button"
                        onClick={() => {
                          setFitSceneRevision((revision) => revision + 1)
                        }}
                      >
                        适配场景
                      </button>
                    </div>
                  </div>
                }
                onSelectionChange={handleSelectionChange}
              />
            </div>
          </div>
        </section>
        <aside className={styles.inspector} aria-label="夹具详情">
          <h2>Catalog</h2>
          <dl>
            <div>
              <dt>fixtureId</dt>
              <dd>{fixture.catalog.fixtureId}</dd>
            </div>
            <div>
              <dt>catalog</dt>
              <dd><code>{fixture.catalogUrl}</code></dd>
            </div>
            <div>
              <dt>gate sha256</dt>
              <dd><code>{fixture.catalog.sourceFamilyGateSha256}</code></dd>
            </div>
          </dl>
          <h2>资产</h2>
          <ul>
            {fixture.assets.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  className={
                    asset.id === selectedAssetId ? styles.assetSelected : undefined
                  }
                  onClick={() => setSelectedAssetId(asset.id)}
                >
                  {asset.family}
                </button>
                {fixture.assetFailures[asset.id] ? (
                  <p className={styles.assetError}>
                    {fixture.assetFailures[asset.id]}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <AssetDetails asset={selectedAsset} />
        </aside>
      </div>
    </main>
  )
}

function Banner(): React.JSX.Element {
  return (
    <p className={styles.banner} role="status">
      候选静态夹具：仅显示与拾取。不是 WorkCellActivation，不启用运动、空间互锁或执行。
    </p>
  )
}

function AssetDetails({
  asset
}: {
  asset: ProjectedFixtureAsset | null
}): React.JSX.Element {
  if (!asset) {
    return <p className={styles.hint}>在场景中点选一个模型，或从左侧列表选择。</p>
  }
  return (
    <section data-testid="asset-pipeline-e2e-details">
      <h2>选中项</h2>
      <dl>
        <div>
          <dt>family</dt>
          <dd>{asset.family}</dd>
        </div>
        <div>
          <dt>revision</dt>
          <dd><code>{asset.trialRevision}</code></dd>
        </div>
        <div>
          <dt>capability</dt>
          <dd>{asset.capabilityGrade}</dd>
        </div>
        <div>
          <dt>拾取粒度</dt>
          <dd>lab-device / family。子实体来自 entity-registry，不是现场 device_id。</dd>
        </div>
      </dl>
      <h3>entity-registry</h3>
      {asset.entities.length === 0 ? (
        <p className={styles.hint}>当前 bundle 没有可读的稳定实体。</p>
      ) : (
        <ul>
          {asset.entities.map((entity) => (
            <li key={entity.sceneEntityId}>
              <code>{entity.sceneEntityId}</code>
              <span>{entity.alias}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default AssetPipelineFixturePage
