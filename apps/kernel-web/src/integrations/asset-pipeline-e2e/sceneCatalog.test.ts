import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  AssetPipelineFixtureError,
  DEFAULT_ASSET_PIPELINE_E2E_CATALOG_PATH,
  parseSceneCatalog,
  projectSceneCatalogToGraph,
  readAssetPipelineFixtureCatalogUrl,
  resolveCatalogAssetUrl
} from './sceneCatalog'

const SAMPLE_CATALOG = {
  schema: 'lab.workbench_static_scene_fixture/v0',
  fixtureId: 'asset-pipeline-e2e-baseline-20260824',
  purpose: 'static_workbench_display_and_picking_only',
  candidate: true,
  notAWorkCellActivation: true,
  sourceFamilyGateSha256: 'a'.repeat(64),
  assetCount: 2,
  safety: {
    motionAllowed: false,
    spatialInterlockAllowed: false,
    executionAllowed: false,
    reason: 'No manufacturer robot URDF is present.'
  },
  assets: [
    sampleAsset('synthesis.capping-gripper', [0, 0, 0]),
    sampleAsset('instrument.square-tactile', [0, 2, 0])
  ]
}

describe('静态 scene-catalog 合同', () => {
  it('只在显式查询参数下打开夹具，并拒绝路径穿越', () => {
    expect(readAssetPipelineFixtureCatalogUrl('')).toBeNull()
    expect(readAssetPipelineFixtureCatalogUrl('?section=material')).toBeNull()
    expect(readAssetPipelineFixtureCatalogUrl('?asset-pipeline-e2e=1')).toBe(
      DEFAULT_ASSET_PIPELINE_E2E_CATALOG_PATH
    )
    expect(
      readAssetPipelineFixtureCatalogUrl(
        '?asset-pipeline-e2e=/__asset_pipeline_e2e__/run/scene-catalog.json'
      )
    ).toBe('/__asset_pipeline_e2e__/run/scene-catalog.json')
    expect(() =>
      readAssetPipelineFixtureCatalogUrl('?asset-pipeline-e2e=/foo/../secret')
    ).toThrow(AssetPipelineFixtureError)
  })

  it('拒绝把 catalog 当成 activation 或放开运动/执行', () => {
    expect(() => parseSceneCatalog({ ...SAMPLE_CATALOG, schema: 'other' }))
      .toThrow('不支持的 catalog schema')
    expect(() =>
      parseSceneCatalog({ ...SAMPLE_CATALOG, notAWorkCellActivation: false })
    ).toThrow('不是 WorkCellActivation')
    expect(() =>
      parseSceneCatalog({
        ...SAMPLE_CATALOG,
        safety: { ...SAMPLE_CATALOG.safety, motionAllowed: true }
      })
    ).toThrow('运动、互锁或执行')
    expect(() =>
      parseSceneCatalog({
        ...SAMPLE_CATALOG,
        assets: [
          {
            ...SAMPLE_CATALOG.assets[0],
            expected: {
              ...SAMPLE_CATALOG.assets[0]!.expected,
              motion: true
            }
          }
        ]
      })
    ).toThrow('expected.motion')
  })

  it('把五个隔离 GLB 投影为 lab-device，且不含 kinematics', () => {
    const catalog = parseSceneCatalog(SAMPLE_CATALOG)
    const catalogUrl = DEFAULT_ASSET_PIPELINE_E2E_CATALOG_PATH
    const { scene, assets } = projectSceneCatalogToGraph(catalog, catalogUrl)
    expect(assets).toHaveLength(2)
    expect(assets[0]?.renderUrl).toBe(
      resolveCatalogAssetUrl(
        catalogUrl,
        SAMPLE_CATALOG.assets[0]!.renderUrl
      )
    )
    const gripper = scene.nodes['lab-fixture-synthesis.capping-gripper'] as {
      type: string
      kinematics?: unknown
      model: { format: string; path: string }
      graphMeta: { notAWorkCellActivation: boolean; fixtureOnlyPreviewTransform: boolean }
    }
    expect(gripper.type).toBe('lab-device')
    expect(gripper.kinematics).toBeUndefined()
    expect(gripper.model.format).toBe('gltf')
    expect(gripper.graphMeta.notAWorkCellActivation).toBe(true)
    expect(gripper.graphMeta.fixtureOnlyPreviewTransform).toBe(true)
    const tactile = scene.nodes['lab-fixture-instrument.square-tactile'] as {
      position: number[]
      kinematics?: unknown
    }
    expect(tactile.position).toEqual([0, 0, -2])
    expect(tactile.kinematics).toBeUndefined()
  })

  it('拒绝 bundle/render 路径穿越', () => {
    expect(() =>
      parseSceneCatalog({
        ...SAMPLE_CATALOG,
        assets: [
          {
            ...SAMPLE_CATALOG.assets[0],
            renderUrl: '../secret.glb'
          }
        ]
      })
    ).toThrow('路径穿越')
  })

  it('能解析交接包基线 catalog', () => {
    const path = resolve(
      process.cwd(),
      '../../../unilab-workbench-e2e-handoff-20260824/workbench-fixture-baseline/scene-catalog.json'
    )
    if (!existsSync(path)) return
    const catalog = parseSceneCatalog(JSON.parse(readFileSync(path, 'utf8')))
    expect(catalog.assetCount).toBe(5)
    expect(catalog.assets.map((asset) => asset.family)).toEqual([
      'synthesis.capping-gripper',
      'synthesis.ptb22-linear-guide',
      'synthesis.250ml-reagent-tray',
      'instrument.square-tactile',
      'instrument.bigclaw.step-reference'
    ])
    const { assets } = projectSceneCatalogToGraph(
      catalog,
      DEFAULT_ASSET_PIPELINE_E2E_CATALOG_PATH
    )
    expect(assets).toHaveLength(5)
    expect(assets.every((asset) => asset.renderUrl.endsWith('render-lod0.glb'))).toBe(true)
  })
})

function sampleAsset(
  family: string,
  translationM: [number, number, number]
) {
  const revision = 'deadbeefdeadbeef'
  return {
    id: family,
    family,
    trialRevision: `input-digest:${revision}`,
    capabilityGrade: 'semantic-scene',
    bundleUrl: `bundles/${family}/${revision.slice(0, 12)}/bundle.json`,
    renderUrl: `bundles/${family}/${revision.slice(0, 12)}/render-lod0.glb`,
    previewTransform: {
      translationM,
      rotationQuatXyzw: [0, 0, 0, 1] as [number, number, number, number],
      scale: 1,
      fixtureOnly: true as const
    },
    expected: {
      display: true,
      stablePicking: true,
      motion: false,
      spatialInterlockEnforced: false,
      execution: false
    }
  }
}
