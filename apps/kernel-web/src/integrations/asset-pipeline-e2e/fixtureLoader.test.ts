import { describe, expect, it } from 'vitest'

import { AssetPipelineFixtureError } from './sceneCatalog'
import { loadAssetPipelineFixture, type FixtureIO } from './fixtureLoader'

const CATALOG_URL = '/__asset_pipeline_e2e__/run/scene-catalog.json'
const FAMILY = 'instrument.square-tactile'
const BUNDLE_URL = `/__asset_pipeline_e2e__/run/bundles/${FAMILY}/abc123abc123/bundle.json`
const GLB_URL = `/__asset_pipeline_e2e__/run/bundles/${FAMILY}/abc123abc123/render-lod0.glb`
const CAPABILITY = {
  grade: 'semantic-scene',
  allows: ['workbench_display', 'stable_picking'],
  forbids: ['motion', 'spatial_interlock_enforced', 'execution'],
  missing: []
}
const REGISTRY = {
  schema: 'lab.entity_registry/v0',
  entities: [{ scene_entity_id: 'sw-occurrence:0000', cad_occurrence_alias: 'Cap2-1' }]
}

describe('静态夹具加载与哈希门禁', () => {
  it('校验 sidecar 哈希并保留 entity-registry', async () => {
    const files = fixtureFiles({ glbSha256: 'glb-digest' })
    const loaded = await loadAssetPipelineFixture(CATALOG_URL, fakeIO(files))
    expect(loaded.assets).toHaveLength(1)
    expect(loaded.assets[0]?.entities).toEqual([
      { sceneEntityId: 'sw-occurrence:0000', alias: 'Cap2-1' }
    ])
    expect(loaded.assetFailures).toEqual({})
  })

  it('GLB 哈希漂移时拒绝加载', async () => {
    const files = fixtureFiles({ glbSha256: 'glb-digest' })
    files[GLB_URL] = { json: null, body: 'tampered', sha256: 'other-digest' }
    await expect(loadAssetPipelineFixture(CATALOG_URL, fakeIO(files)))
      .rejects.toThrow('哈希漂移')
  })

  it('GLB 404 时保留其余场景并记录该资产失败', async () => {
    const files = fixtureFiles({ glbSha256: 'glb-digest' })
    delete files[GLB_URL]
    const loaded = await loadAssetPipelineFixture(CATALOG_URL, fakeIO(files))
    expect(loaded.scene.nodes['lab-fixture-instrument.square-tactile']).toBeDefined()
    expect(loaded.assetFailures[FAMILY]).toMatch(/HTTP 404/)
  })

  it('capability 未禁止 motion 时失败关闭', async () => {
    const files = fixtureFiles({ glbSha256: 'glb-digest' })
    files[capabilityUrl()] = {
      json: { ...CAPABILITY, forbids: ['execution'] },
      body: '',
      sha256: 'capability-digest'
    }
    await expect(loadAssetPipelineFixture(CATALOG_URL, fakeIO(files)))
      .rejects.toBeInstanceOf(AssetPipelineFixtureError)
  })

  it('catalog 404 时受控失败，不把 HTML 当 JSON', async () => {
    await expect(loadAssetPipelineFixture(CATALOG_URL, fakeIO({})))
      .rejects.toThrow('无法读取 scene-catalog.json（HTTP 404）')
  })

  it('catalog 被 SPA 回成 HTML 时受控失败', async () => {
    const io: FixtureIO = {
      fetch: async () =>
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        }),
      sha256Hex: async () => 'unused'
    }
    await expect(loadAssetPipelineFixture(CATALOG_URL, io)).rejects.toThrow(
      'scene-catalog.json 不是 JSON'
    )
  })
})

function capabilityUrl(): string {
  return BUNDLE_URL.replace(/bundle\.json$/, 'capability.json')
}

function fixtureFiles(options: { glbSha256: string }): Record<string, FakeFile> {
  const capabilityBody = JSON.stringify(CAPABILITY)
  const registryBody = JSON.stringify(REGISTRY)
  const bundle = {
    schema: 'lab.family_sim_bundle/v0',
    family: FAMILY,
    trial_revision: 'source-files-digest:abc',
    immutable_candidate: true,
    artifacts: [
      { path: 'capability.json', bytes: 1, sha256: 'capability-digest' },
      { path: 'entity-registry.json', bytes: 1, sha256: 'registry-digest' },
      { path: 'render-lod0.glb', bytes: 4, sha256: options.glbSha256 }
    ]
  }
  return {
    [CATALOG_URL]: {
      json: catalogDocument(),
      body: '',
      sha256: 'catalog'
    },
    [BUNDLE_URL]: {
      json: bundle,
      body: '',
      sha256: 'bundle'
    },
    [capabilityUrl()]: {
      json: CAPABILITY,
      body: capabilityBody,
      sha256: 'capability-digest'
    },
    [BUNDLE_URL.replace(/bundle\.json$/, 'entity-registry.json')]: {
      json: REGISTRY,
      body: registryBody,
      sha256: 'registry-digest'
    },
    [GLB_URL]: {
      json: null,
      body: 'glb!',
      sha256: options.glbSha256
    }
  }
}

function catalogDocument() {
  return {
    schema: 'lab.workbench_static_scene_fixture/v0',
    fixtureId: 'run',
    purpose: 'static_workbench_display_and_picking_only',
    candidate: true,
    notAWorkCellActivation: true,
    sourceFamilyGateSha256: 'a'.repeat(64),
    assetCount: 1,
    safety: {
      motionAllowed: false,
      spatialInterlockAllowed: false,
      executionAllowed: false,
      reason: 'fixture'
    },
    assets: [
      {
        id: FAMILY,
        family: FAMILY,
        trialRevision: 'source-files-digest:abc',
        capabilityGrade: 'semantic-scene',
        bundleUrl: `bundles/${FAMILY}/abc123abc123/bundle.json`,
        renderUrl: `bundles/${FAMILY}/abc123abc123/render-lod0.glb`,
        previewTransform: {
          translationM: [0, 0, 0],
          rotationQuatXyzw: [0, 0, 0, 1],
          scale: 1,
          fixtureOnly: true
        },
        expected: {
          display: true,
          stablePicking: true,
          motion: false,
          spatialInterlockEnforced: false,
          execution: false
        }
      }
    ]
  }
}

interface FakeFile {
  json: unknown
  body: string
  sha256: string
}

function fakeIO(files: Record<string, FakeFile>): FixtureIO {
  return {
    fetch: async (url: string) => {
      const file = files[url]
      if (!file) {
        return new Response(null, { status: 404 })
      }
      if (file.json !== null) {
        return new Response(JSON.stringify(file.json), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response(file.body, { status: 200 })
    },
    sha256Hex: async (data: ArrayBuffer) => {
      const text = new TextDecoder().decode(data)
      const match = Object.values(files).find((file) =>
        file.json !== null
          ? JSON.stringify(file.json) === text
          : file.body === text
      )
      return match?.sha256 ?? 'unknown'
    }
  }
}
