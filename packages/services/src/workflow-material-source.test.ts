import { describe, expect, it } from 'vitest'

import { getDefaultBackend } from './backends'
import type { HttpClient } from './http'
import { createWorkflowRuntime } from './workflow'

const frameworkTemplateUuid = '21000000-0000-4000-8000-000000000001'
const frameworkOwnerUuid = '31000000-0000-4000-8000-000000000001'
const frameworkHandleUuid = '41000000-0000-4000-8000-000000000001'
const mountUuid = '51000000-0000-4000-8000-000000000001'
const materialUuid = '52000000-0000-4000-8000-000000000001'
const mountTemplateUuid = '61000000-0000-4000-8000-000000000001'
const sampleTemplateUuid = '62000000-0000-4000-8000-000000000001'
const firstSiteUuid = '71000000-0000-4000-8000-000000000009'
const secondSiteUuid = '71000000-0000-4000-8000-000000000001'
const fingerprint = `sha256:${'b'.repeat(64)}`

describe('Workflow MaterialSource catalog adapter', () => {
  it('loads the framework template and inventory facts in Site business order', async () => {
    const requests: string[] = []
    const fixture = responses()
    const runtime = createWorkflowRuntime(
      fixtureHttp(fixture, requests),
      getDefaultBackend('local-python')
    )

    const snapshot = await runtime.getWorkflowMaterialSourceCatalog()
    expect(snapshot).toEqual({
      authorityId: 'os-local',
      authorityKind: 'local',
      fingerprint,
      template: {
        uuid: frameworkTemplateUuid,
        resourceTemplateUuid: frameworkOwnerUuid,
        name: 'material_source',
        displayName: 'Material Source',
        actionClass: 'unilabos.workflow.authoring:material_source',
        actionType: 'material_source',
        sourceHandle: {
          uuid: frameworkHandleUuid,
          workflowNodeTemplateUuid: frameworkTemplateUuid,
          handleKey: 'material',
          ioType: 'source',
          displayName: 'Material',
          valueType: 'ResourceSlot',
          required: false,
          dataSource: 'executor',
          dataKey: 'material'
        }
      },
      resourceTemplates: [
        {
          uuid: mountTemplateUuid,
          displayName: 'Deck'
        },
        {
          uuid: sampleTemplateUuid,
          displayName: 'Plate96',
          shape: {
            id: 'plate96',
            bundle: 'test',
            displayName: undefined,
            categories: ['plate96'],
            categoryTokens: [],
            priority: 0,
            envelopeMm: [127, 85, 15],
            units: 'ratio',
            shadow: 'box',
            sort: 'center',
            parts: [{
              type: 'box',
              style: 'plate',
              from: [0, 0, 0],
              to: [1, 1, 1]
            }]
          }
        }
      ],
      materials: [
        {
          uuid: mountUuid,
          name: 'Deck A',
          resourceTemplateUuid: mountTemplateUuid,
          materialClass: 'Deck'
        },
        {
          uuid: materialUuid,
          name: 'Assay plate',
          resourceTemplateUuid: sampleTemplateUuid,
          materialClass: 'Plate96'
        }
      ],
      sites: [
        {
          uuid: firstSiteUuid,
          name: 'Slot A',
          sortOrder: 1,
          mountMaterialUuid: mountUuid,
          allowedResourceTemplateUuids: [sampleTemplateUuid],
          occupiedMaterialUuid: null
        },
        {
          uuid: secondSiteUuid,
          name: 'Slot B',
          sortOrder: 2,
          mountMaterialUuid: mountUuid,
          allowedResourceTemplateUuids: [],
          occupiedMaterialUuid: materialUuid
        }
      ]
    })
    expect(snapshot.template.wireValue).toEqual(
      (fixture[
        `/api/v1/workflow-node-templates/${frameworkTemplateUuid}`
      ] as { data: { template: Record<string, unknown> } }).data.template
    )
    expect(snapshot.template.sourceHandle.wireValue).toEqual(
      (fixture[
        `/api/v1/workflow-node-templates/${frameworkTemplateUuid}`
      ] as { data: { handles: Record<string, unknown>[] } }).data.handles[0]
    )
    expect(requests).toEqual([
      '/api/v1/workflow-node-templates?page=1&page_size=100',
      `/api/v1/workflow-node-templates/${frameworkTemplateUuid}`,
      '/api/v1/inventory/materials?limit=500',
      '/api/v1/inventory/sites?limit=500',
      '/api/v1/resource-templates?limit=100',
      '/api/v1/material-shapes',
      `/api/v1/resource-templates?limit=100&cursor_uuid=${mountTemplateUuid}`
    ])
  })

  it('fails closed when the OS publishes no exact MaterialSource framework template', async () => {
    const fixture = responses()
    const list = fixture[
      '/api/v1/workflow-node-templates?page=1&page_size=100'
    ] as { data: { items: Array<Record<string, unknown>> } }
    list.data.items[0].node_type = 'device'
    const runtime = createWorkflowRuntime(
      fixtureHttp(fixture, []),
      getDefaultBackend('local-python')
    )

    await expect(runtime.getWorkflowMaterialSourceCatalog()).rejects.toThrow(
      'MaterialSource framework template'
    )
  })
})

function responses(): Record<string, unknown> {
  return {
    '/api/v1/workflow-node-templates?page=1&page_size=100': {
      code: 0,
      data: {
        authority: { authority_id: 'os-local', kind: 'local' },
        catalog_fingerprint: fingerprint,
        items: [{
          uuid: frameworkTemplateUuid,
          name: 'material_source',
          display_name: 'Material Source',
          type: 'material_source',
          node_type: 'material_source',
          resource_template: {
            uuid: frameworkOwnerUuid,
            name: 'host_node',
            display_name: 'Host node'
          }
        }],
        total: 1,
        page: 1,
        page_size: 100
      }
    },
    [`/api/v1/workflow-node-templates/${frameworkTemplateUuid}`]: {
      code: 0,
      data: {
        authority: { authority_id: 'os-local', kind: 'local' },
        catalog_fingerprint: fingerprint,
        template: {
          uuid: frameworkTemplateUuid,
          resource_template_uuid: frameworkOwnerUuid,
          name: 'material_source',
          display_name: 'Material Source',
          class: 'unilabos.workflow.authoring:material_source',
          type: 'material_source',
          node_type: 'material_source',
          schema: null,
          goal: {},
          goal_default: {},
          meta_data: {}
        },
        handles: [{
          uuid: frameworkHandleUuid,
          workflow_node_template_uuid: frameworkTemplateUuid,
          handle_key: 'material',
          io_type: 'source',
          display_name: 'Material',
          type: 'ResourceSlot',
          required: false,
          data_source: 'executor',
          data_key: 'material',
          meta_data: {}
        }]
      }
    },
    '/api/v1/inventory/materials?limit=500': {
      materials: [
        inventoryMaterial(materialUuid, sampleTemplateUuid, 'Plate96', 'Assay plate'),
        inventoryMaterial(mountUuid, mountTemplateUuid, 'Deck', 'Deck A')
      ]
    },
    '/api/v1/inventory/sites?limit=500': {
      sites: [
        inventorySite(secondSiteUuid, 'Slot B', 2, materialUuid, []),
        inventorySite(firstSiteUuid, 'Slot A', 1, null, [sampleTemplateUuid])
      ]
    },
    '/api/v1/resource-templates?limit=100': {
      code: 0,
      data: {
        items: [
          {
            uuid: mountTemplateUuid,
            name: 'test.Deck',
            display_name: 'Deck',
            resource_type: 'resource',
            tags: []
          }
        ],
        has_more: true,
        next_cursor_uuid: mountTemplateUuid
      }
    },
    [`/api/v1/resource-templates?limit=100&cursor_uuid=${mountTemplateUuid}`]: {
      code: 0,
      data: {
        items: [
          {
            uuid: sampleTemplateUuid,
            name: 'test.Plate96',
            display_name: 'Plate96',
            resource_type: 'resource',
            tags: []
          }
        ],
        has_more: false,
        next_cursor_uuid: null
      }
    },
    '/api/v1/material-shapes': {
      code: 0,
      data: {
        items: [{
          id: 'plate96',
          bundle: 'test',
          categories: ['plate96'],
          categoryTokens: [],
          priority: 0,
          envelope: [127, 85, 15],
          units: 'ratio',
          shadow: 'box',
          sort: 'center',
          parts: [{
            type: 'box',
            style: 'plate',
            from: [0, 0, 0],
            to: [1, 1, 1]
          }]
        }]
      }
    }
  }
}

function inventoryMaterial(
  uuid: string,
  resourceTemplateUuid: string,
  materialClass: string,
  name: string
): Record<string, unknown> {
  return {
    uuid,
    resource_template_uuid: resourceTemplateUuid,
    class: materialClass,
    name,
    deleted_at: null
  }
}

function inventorySite(
  uuid: string,
  name: string,
  sortOrder: number,
  occupiedMaterialUuid: string | null,
  allowedResourceTemplateUuids: string[]
): Record<string, unknown> {
  return {
    uuid,
    name,
    sort_order: sortOrder,
    material_uuid: mountUuid,
    allowed_resource_template_uuids: allowedResourceTemplateUuids,
    occupied_material_uuid: occupiedMaterialUuid,
    deleted_at: null
  }
}

function fixtureHttp(
  fixture: Record<string, unknown>,
  requests: string[]
): HttpClient {
  return {
    request: async <Value>(path: string): Promise<Value> => {
      requests.push(path)
      if (!Object.prototype.hasOwnProperty.call(fixture, path)) {
        throw new Error(`Unexpected request: ${path}`)
      }
      return structuredClone(fixture[path]) as Value
    }
  }
}
