import { describe, expect, it } from 'vitest'

import { getDefaultBackend } from './backends'
import type { HttpClient } from './http'
import { createWorkflowRuntime } from './workflow'

const nodeUuid = '20000000-0000-4000-8000-000000000001'
const targetUuid = '30000000-0000-4000-8000-000000000001'
const sourceUuid = '30000000-0000-4000-8000-000000000002'
const resourceTemplateUuid = '10000000-0000-4000-8000-000000000001'
const workflowNodeUuid = '20000000-0000-4000-8000-000000000002'
const workflowUuid = '40000000-0000-4000-8000-000000000001'
const workflowInputUuid = '30000000-0000-4000-8000-000000000010'
const workflowOutputUuid = '30000000-0000-4000-8000-000000000011'
const workflowReadyTargetUuid = '30000000-0000-4000-8000-000000000012'
const workflowReadySourceUuid = '30000000-0000-4000-8000-000000000013'
const hostResourceTemplateUuid = '10000000-0000-4000-8000-000000000002'
const frameworkNodeUuid = '20000000-0000-4000-8000-000000000099'
const frameworkResourceTemplateUuid =
  '10000000-0000-4000-8000-000000000099'
const fingerprint = `sha256:${'a'.repeat(64)}`
const authority = { authority_id: 'os-local', kind: 'local' }

describe('Workflow Action Catalog adapter', () => {
  it('loads one authority-scoped snapshot without splitting action strings', async () => {
    const requests: string[] = []
    const runtime = createWorkflowRuntime(
      fixtureHttp(catalogResponses(), requests),
      getDefaultBackend('local-python')
    )

    await expect(runtime.getWorkflowActionCatalog()).resolves.toEqual({
      authorityId: 'os-local',
      authorityKind: 'local',
      fingerprint,
      nodeTemplates: [
        {
          uuid: nodeUuid,
          resourceTemplateUuid,
          name: 'transfer.sample.v1',
          displayName: '转移样品',
          actionClass: 'szlab.devices.pump:Pump',
          actionType: 'UniLabJsonCommand',
          schema: actionSchema(),
          goal: {
            sample: 'sample',
            mode: 'mode'
          },
          goalDefault: { mode: 'safe' },
          handles: [
            {
              uuid: targetUuid,
              workflowNodeTemplateUuid: nodeUuid,
              handleKey: 'sample.input.v1',
              ioType: 'target',
              displayName: '样品',
              valueType: 'ResourceSlot',
              required: true,
              dataSource: 'goal',
              dataKey: 'sample',
              valueSchema: { $slot: 'ResourceSlot' },
              editorControl: 'material_port',
              allowedResourceTemplateUuids: [resourceTemplateUuid],
              implicitPassthrough: false,
              structuralRole: null
            },
            {
              uuid: sourceUuid,
              workflowNodeTemplateUuid: nodeUuid,
              handleKey: 'sample.output.v1',
              ioType: 'source',
              displayName: '处理后样品',
              valueType: 'ResourceSlot',
              required: false,
              dataSource: 'result',
              dataKey: 'sample',
              valueSchema: { $slot: 'ResourceSlot' },
              editorControl: 'material_port',
              allowedResourceTemplateUuids: [resourceTemplateUuid],
              implicitPassthrough: true,
              structuralRole: null
            }
          ]
        }
      ]
    })
    expect(requests).toEqual([
      '/api/v1/workflow-node-templates?page=1&page_size=100',
      `/api/v1/workflow-node-templates/${nodeUuid}`
    ])
  })

  it('loads one coherent executable union with a complete Published Workflow projection', async () => {
    const requests: string[] = []
    const responses = executableCatalogResponses()
    const runtime = createWorkflowRuntime(
      fixtureHttp(responses, requests),
      getDefaultBackend('local-python')
    )

    const catalog = await runtime.getWorkflowActionCatalog() as unknown as {
      authorityId: string
      authorityKind: string
      fingerprint: string
      actionTemplates: Array<Record<string, unknown>>
      workflowTemplates: Array<Record<string, unknown>>
    }

    expect(catalog).toEqual({
      authorityId: 'os-local',
      authorityKind: 'local',
      fingerprint,
      actionTemplates: [expect.objectContaining({
        uuid: nodeUuid,
        name: 'transfer.sample.v1'
      })],
      workflowTemplates: [{
        uuid: workflowNodeUuid,
        resourceTemplateUuid: hostResourceTemplateUuid,
        name: `workflow:${workflowUuid}`,
        displayName: 'Prepare sample',
        workflowClass: 'c1_published_lab.workflows.child:prepare_sample',
        workflowUuid,
        workflowRevision: 7,
        appliedSourceHash: `sha256:${'b'.repeat(64)}`,
        contractDigest: `sha256:${'c'.repeat(64)}`,
        compositionAllowTransparent: false,
        inputOrder: ['sample'],
        outputOrder: ['final_sample'],
        schema: workflowSchema(),
        goal: { sample: 'sample' },
        goalDefault: {},
        result: { final_sample: 'final_sample' },
        source: {
          kind: 'package',
          definitionFqid: 'c1_published_lab.workflows.prepare_sample',
          module: 'c1_published_lab.workflows.child',
          symbol: 'prepare_sample',
          packageCatalogDigest: `sha256:${'d'.repeat(64)}`,
          definitionContentHash: `sha256:${'e'.repeat(64)}`
        },
        handles: [
          expectedWorkflowHandle({
            uuid: workflowInputUuid,
            handleKey: 'sample',
            ioType: 'target',
            displayName: 'Sample',
            valueType: 'ResourceSlot',
            required: true,
            dataSource: 'goal',
            dataKey: 'sample',
            valueSchema: resourceSlotSchema(),
            editorControl: 'material_port',
            allowedResourceTemplateUuids: [resourceTemplateUuid],
            implicitPassthrough: false,
            structuralRole: null
          }),
          expectedWorkflowHandle({
            uuid: workflowOutputUuid,
            handleKey: 'final_sample',
            ioType: 'source',
            displayName: 'Final sample',
            valueType: 'ResourceSlot',
            required: false,
            dataSource: 'result',
            dataKey: 'final_sample',
            valueSchema: nullableResourceSlotSchema(),
            editorControl: 'material_port',
            allowedResourceTemplateUuids: [resourceTemplateUuid],
            implicitPassthrough: true,
            structuralRole: null
          }),
          expectedWorkflowHandle({
            uuid: workflowReadyTargetUuid,
            handleKey: 'ready',
            ioType: 'target',
            displayName: 'Ready',
            valueType: 'boolean',
            required: false,
            dataSource: 'dependency',
            dataKey: 'ready',
            valueSchema: { type: 'boolean' },
            editorControl: 'variable_selector',
            allowedResourceTemplateUuids: null,
            implicitPassthrough: false,
            structuralRole: 'ready'
          }),
          expectedWorkflowHandle({
            uuid: workflowReadySourceUuid,
            handleKey: 'ready',
            ioType: 'source',
            displayName: 'Ready',
            valueType: 'boolean',
            required: false,
            dataSource: 'dependency',
            dataKey: 'ready',
            valueSchema: { type: 'boolean' },
            editorControl: 'variable_selector',
            allowedResourceTemplateUuids: null,
            implicitPassthrough: false,
            structuralRole: 'ready'
          })
        ]
      }]
    })
    expect(requests).toEqual([
      '/api/v1/workflow-node-templates?page=1&page_size=100',
      `/api/v1/workflow-node-templates/${nodeUuid}`,
      `/api/v1/workflow-node-templates/${workflowNodeUuid}`,
      `/api/v1/workflow-node-templates/${frameworkNodeUuid}`
    ])

    const workflowTemplate = catalog.workflowTemplates[0]!
    expect(Object.keys(workflowTemplate)).not.toContain('wireValue')
    expect(Object.getOwnPropertyDescriptor(
      workflowTemplate,
      'wireValue'
    )).toMatchObject({ enumerable: false, writable: false })
    expect(workflowTemplate.wireValue).toEqual(
      detailDataFor(responses, workflowNodeUuid).template
    )
    for (const handle of workflowTemplate.handles as Array<
      Record<string, unknown>
    >) {
      expect(Object.keys(handle)).not.toContain('wireValue')
      expect(Object.getOwnPropertyDescriptor(handle, 'wireValue'))
        .toMatchObject({ enumerable: false, writable: false })
    }
  })

  it('reads every page and excludes non-Action framework templates', async () => {
    const requests: string[] = []
    const responses = catalogResponses()
    const first = responses[
      '/api/v1/workflow-node-templates?page=1&page_size=100'
    ] as Envelope
    const typedSummary = structuredClone(
      (first.data as { items: unknown[] }).items[0]
    )
    ;(first.data as Record<string, unknown>).items = [{
      uuid: frameworkNodeUuid,
      name: 'material_source',
      display_name: 'Material Source',
      type: 'framework',
      node_type: 'material_source',
      resource_template: {
        uuid: frameworkResourceTemplateUuid,
        name: 'unilabos.resources.material_source',
        display_name: 'Material Source'
      }
    }]
    ;(first.data as Record<string, unknown>).total = 2
    responses['/api/v1/workflow-node-templates?page=2&page_size=100'] = {
      code: 0,
      data: {
        authority,
        catalog_fingerprint: fingerprint,
        items: [typedSummary],
        total: 2,
        page: 2,
        page_size: 100
      }
    }
    responses[
      `/api/v1/workflow-node-templates/${frameworkNodeUuid}`
    ] = {
      code: 0,
      data: {
        authority,
        catalog_fingerprint: fingerprint,
        template: {
          uuid: frameworkNodeUuid,
          resource_template_uuid: frameworkResourceTemplateUuid,
          name: 'material_source',
          display_name: 'Material Source',
          class: null,
          type: 'framework',
          node_type: 'material_source',
          schema: null,
          goal: {},
          goal_default: {},
          feedback: {},
          result: {},
          meta_data: {}
        },
        handles: []
      }
    }
    const runtime = createWorkflowRuntime(
      fixtureHttp(responses, requests),
      getDefaultBackend('local-python')
    )

    const catalog = await runtime.getWorkflowActionCatalog()

    expect(catalog.nodeTemplates.map((item) => item.uuid)).toEqual([nodeUuid])
    expect(requests).toEqual([
      '/api/v1/workflow-node-templates?page=1&page_size=100',
      '/api/v1/workflow-node-templates?page=2&page_size=100',
      `/api/v1/workflow-node-templates/${frameworkNodeUuid}`,
      `/api/v1/workflow-node-templates/${nodeUuid}`
    ])
  })

  it.each([
    {
      name: 'missing fingerprint',
      mutate: (responses: Record<string, unknown>) => {
        delete ((responses[
          '/api/v1/workflow-node-templates?page=1&page_size=100'
        ] as Envelope)
          .data as Record<string, unknown>).catalog_fingerprint
      }
    },
    {
      name: 'detail fingerprint changed',
      mutate: (responses: Record<string, unknown>) => {
        const data = (responses[
          `/api/v1/workflow-node-templates/${nodeUuid}`
        ] as Envelope).data as Record<string, unknown>
        data.catalog_fingerprint = `sha256:${'b'.repeat(64)}`
      }
    },
    {
      name: 'duplicate node UUID',
      mutate: (responses: Record<string, unknown>) => {
        const envelope = responses[
          '/api/v1/workflow-node-templates?page=1&page_size=100'
        ] as Envelope
        const data = envelope.data as { items: unknown[] }
        data.items.push(structuredClone(data.items[0]))
      }
    },
    {
      name: 'wrong Handle parent',
      mutate: (responses: Record<string, unknown>) => {
        const handles = detailData(responses).handles
        handles[0].workflow_node_template_uuid =
          '20000000-0000-4000-8000-000000000099'
      }
    },
    {
      name: 'duplicate Handle UUID',
      mutate: (responses: Record<string, unknown>) => {
        const handles = detailData(responses).handles
        handles[1].uuid = handles[0].uuid
      }
    },
    {
      name: 'unknown io_type',
      mutate: (responses: Record<string, unknown>) => {
        detailData(responses).handles[0].io_type = 'input'
      }
    },
    {
      name: 'unknown editor control',
      mutate: (responses: Record<string, unknown>) => {
        detailData(responses).handles[0].meta_data = {
          unilab: {
            value_schema: { $slot: 'ResourceSlot' },
            editor_control: 'guessed_from_field_name',
            allowed_resource_template_uuids: [resourceTemplateUuid],
            implicit_passthrough: false
          }
        }
      }
    },
    {
      name: 'invalid allowlist',
      mutate: (responses: Record<string, unknown>) => {
        detailData(responses).handles[0].meta_data = {
          unilab: {
            value_schema: { $slot: 'ResourceSlot' },
            editor_control: 'material_port',
            allowed_resource_template_uuids: [],
            implicit_passthrough: false
          }
        }
      }
    }
  ])('fails closed for a malformed $name', async ({ mutate }) => {
    const responses = catalogResponses()
    mutate(responses)
    const runtime = createWorkflowRuntime(
      fixtureHttp(responses),
      getDefaultBackend('local-python')
    )

    await expect(runtime.getWorkflowActionCatalog()).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      retryable: false
    })
  })

  it('does not retain a catalog from another authority or fingerprint', async () => {
    const first = createWorkflowRuntime(
      fixtureHttp(catalogResponses()),
      {
        ...getDefaultBackend('local-python'),
        apiUrl: 'http://127.0.0.1:8101'
      }
    )
    const secondResponses = catalogResponses()
    const listEnvelope = secondResponses[
      '/api/v1/workflow-node-templates?page=1&page_size=100'
    ] as Envelope
    const list = listEnvelope.data as Record<string, unknown>
    const detail = (secondResponses[
      `/api/v1/workflow-node-templates/${nodeUuid}`
    ] as Envelope).data as Record<string, unknown>
    list.authority = { authority_id: 'os-lab-b', kind: 'local' }
    detail.authority = { authority_id: 'os-lab-b', kind: 'local' }
    list.catalog_fingerprint = `sha256:${'c'.repeat(64)}`
    detail.catalog_fingerprint = `sha256:${'c'.repeat(64)}`
    const second = createWorkflowRuntime(
      fixtureHttp(secondResponses),
      {
        ...getDefaultBackend('local-python'),
        apiUrl: 'http://127.0.0.1:8102'
      }
    )

    const [catalogA, catalogB] = await Promise.all([
      first.getWorkflowActionCatalog(),
      second.getWorkflowActionCatalog()
    ])
    expect(catalogA.authorityId).toBe('os-local')
    expect(catalogA.fingerprint).toBe(fingerprint)
    expect(catalogB.authorityId).toBe('os-lab-b')
    expect(catalogB.fingerprint).toBe(`sha256:${'c'.repeat(64)}`)
  })
})

interface Envelope {
  code: number
  data: unknown
}

interface RawHandle {
  uuid: string
  workflow_node_template_uuid: string
  io_type: string
  meta_data: Record<string, unknown>
  [key: string]: unknown
}

function detailData(responses: Record<string, unknown>): {
  handles: RawHandle[]
} {
  return detailDataFor(responses, nodeUuid)
}

function detailDataFor(
  responses: Record<string, unknown>,
  templateUuid: string
): {
  template: Record<string, unknown>
  handles: RawHandle[]
} {
  return (responses[
    `/api/v1/workflow-node-templates/${templateUuid}`
  ] as Envelope).data as {
    template: Record<string, unknown>
    handles: RawHandle[]
  }
}

function actionSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      goal: {
        type: 'object',
        properties: {
          sample: { $slot: 'ResourceSlot' },
          mode: {
            type: 'string',
            enum: ['safe', 'fast'],
            default: 'safe'
          }
        },
        required: ['sample'],
        additionalProperties: false
      },
      feedback: {},
      result: {
        type: 'object',
        properties: { sample: { $slot: 'ResourceSlot' } },
        required: ['sample'],
        additionalProperties: false
      }
    },
    required: ['goal'],
    'x-unilabos-action-contract': {
      version: 1,
      input_order: ['sample', 'mode'],
      output_order: ['sample'],
      resource_template_symbols: { goal: {}, result: {} }
    }
  }
}

function resourceSlotSchema(): Record<string, unknown> {
  return {
    $slot: 'ResourceSlot',
    allowed_resource_template_uuids: [resourceTemplateUuid]
  }
}

function nullableResourceSlotSchema(): Record<string, unknown> {
  return {
    anyOf: [resourceSlotSchema(), { type: 'null' }]
  }
}

function workflowSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      goal: {
        type: 'object',
        additionalProperties: false,
        properties: { sample: resourceSlotSchema() },
        required: ['sample']
      },
      result: {
        type: 'object',
        additionalProperties: false,
        properties: { final_sample: nullableResourceSlotSchema() },
        required: ['final_sample']
      }
    },
    required: ['goal', 'result'],
    'x-unilabos-workflow-contract': {
      version: 1,
      compatibility_version: 1,
      workflow_uuid: workflowUuid,
      workflow_revision: 7,
      applied_source_hash: `sha256:${'b'.repeat(64)}`,
      contract_digest: `sha256:${'c'.repeat(64)}`,
      composition_allow_transparent: false,
      input_order: ['sample'],
      output_order: ['final_sample']
    }
  }
}

function expectedWorkflowHandle(
  value: Omit<Record<string, unknown>, 'workflowNodeTemplateUuid'>
): Record<string, unknown> {
  return {
    ...value,
    workflowNodeTemplateUuid: workflowNodeUuid
  }
}

function executableCatalogResponses(): Record<string, unknown> {
  const responses = catalogResponses()
  const list = (responses[
    '/api/v1/workflow-node-templates?page=1&page_size=100'
  ] as Envelope).data as { items: Array<Record<string, unknown>>; total: number }
  list.items.push(
    {
      uuid: workflowNodeUuid,
      name: `workflow:${workflowUuid}`,
      display_name: 'Prepare sample',
      type: 'workflow',
      node_type: 'workflow',
      resource_template: {
        uuid: hostResourceTemplateUuid,
        name: 'host_node',
        display_name: 'Host Node'
      }
    },
    {
      uuid: frameworkNodeUuid,
      name: 'group',
      display_name: 'Group',
      type: 'group',
      node_type: 'group',
      resource_template: {
        uuid: frameworkResourceTemplateUuid,
        name: 'host_node',
        display_name: 'Host Node'
      }
    }
  )
  list.total = 3
  responses[`/api/v1/workflow-node-templates/${workflowNodeUuid}`] = {
    code: 0,
    data: {
      authority,
      catalog_fingerprint: fingerprint,
      template: {
        uuid: workflowNodeUuid,
        resource_template_uuid: hostResourceTemplateUuid,
        name: `workflow:${workflowUuid}`,
        display_name: 'Prepare sample',
        class: 'c1_published_lab.workflows.child:prepare_sample',
        type: 'workflow',
        node_type: 'workflow',
        schema: workflowSchema(),
        goal: { sample: 'sample' },
        goal_default: {},
        feedback: {},
        result: { final_sample: 'final_sample' },
        meta_data: {
          unilab: {
            framework_owner_only: true,
            workflow_source: {
              kind: 'package',
              definition_fqid:
                'c1_published_lab.workflows.prepare_sample',
              module: 'c1_published_lab.workflows.child',
              symbol: 'prepare_sample',
              package_catalog_digest: `sha256:${'d'.repeat(64)}`,
              definition_content_hash: `sha256:${'e'.repeat(64)}`
            }
          }
        }
      },
      handles: [
        rawWorkflowHandle({
          uuid: workflowInputUuid,
          handle_key: 'sample',
          io_type: 'target',
          display_name: 'Sample',
          type: 'ResourceSlot',
          required: true,
          data_source: 'goal',
          data_key: 'sample',
          valueSchema: resourceSlotSchema(),
          editorControl: 'material_port',
          allowedResourceTemplateUuids: [resourceTemplateUuid],
          implicitPassthrough: false
        }),
        rawWorkflowHandle({
          uuid: workflowOutputUuid,
          handle_key: 'final_sample',
          io_type: 'source',
          display_name: 'Final sample',
          type: 'ResourceSlot',
          required: false,
          data_source: 'result',
          data_key: 'final_sample',
          valueSchema: nullableResourceSlotSchema(),
          editorControl: 'material_port',
          allowedResourceTemplateUuids: [resourceTemplateUuid],
          implicitPassthrough: true
        }),
        rawWorkflowHandle({
          uuid: workflowReadyTargetUuid,
          handle_key: 'ready',
          io_type: 'target',
          display_name: 'Ready',
          type: 'boolean',
          required: false,
          data_source: 'dependency',
          data_key: 'ready',
          valueSchema: { type: 'boolean' },
          editorControl: 'variable_selector',
          allowedResourceTemplateUuids: null,
          implicitPassthrough: false,
          structuralRole: 'ready'
        }),
        rawWorkflowHandle({
          uuid: workflowReadySourceUuid,
          handle_key: 'ready',
          io_type: 'source',
          display_name: 'Ready',
          type: 'boolean',
          required: false,
          data_source: 'dependency',
          data_key: 'ready',
          valueSchema: { type: 'boolean' },
          editorControl: 'variable_selector',
          allowedResourceTemplateUuids: null,
          implicitPassthrough: false,
          structuralRole: 'ready'
        })
      ]
    }
  }
  responses[`/api/v1/workflow-node-templates/${frameworkNodeUuid}`] = {
    code: 0,
    data: {
      authority,
      catalog_fingerprint: fingerprint,
      template: {
        uuid: frameworkNodeUuid,
        resource_template_uuid: frameworkResourceTemplateUuid,
        name: 'group',
        display_name: 'Group',
        class: 'unilabos.workflow.authoring:group',
        type: 'group',
        node_type: 'group',
        schema: null,
        goal: {},
        goal_default: {},
        feedback: {},
        result: {},
        meta_data: {
          unilab: { framework_owner_only: true }
        }
      },
      handles: []
    }
  }
  return responses
}

function rawWorkflowHandle(input: {
  uuid: string
  handle_key: string
  io_type: string
  display_name: string
  type: string
  required: boolean
  data_source: string
  data_key: string
  valueSchema: Record<string, unknown>
  editorControl: string
  allowedResourceTemplateUuids: string[] | null
  implicitPassthrough: boolean
  structuralRole?: 'ready'
}): Record<string, unknown> {
  return {
    uuid: input.uuid,
    workflow_node_template_uuid: workflowNodeUuid,
    handle_key: input.handle_key,
    io_type: input.io_type,
    display_name: input.display_name,
    type: input.type,
    required: input.required,
    data_source: input.data_source,
    data_key: input.data_key,
    meta_data: {
      unilab: {
        value_schema: input.valueSchema,
        editor_control: input.editorControl,
        allowed_resource_template_uuids:
          input.allowedResourceTemplateUuids,
        implicit_passthrough: input.implicitPassthrough,
        ...(input.structuralRole
          ? { structural_role: input.structuralRole }
          : {})
      }
    }
  }
}

function catalogResponses(): Record<string, unknown> {
  const handles = [
    {
      uuid: targetUuid,
      workflow_node_template_uuid: nodeUuid,
      handle_key: 'sample.input.v1',
      io_type: 'target',
      display_name: '样品',
      type: 'ResourceSlot',
      required: true,
      data_source: 'goal',
      data_key: 'sample',
      meta_data: {
        unilab: {
          value_schema: { $slot: 'ResourceSlot' },
          editor_control: 'material_port',
          allowed_resource_template_uuids: [resourceTemplateUuid],
          implicit_passthrough: false
        }
      }
    },
    {
      uuid: sourceUuid,
      workflow_node_template_uuid: nodeUuid,
      handle_key: 'sample.output.v1',
      io_type: 'source',
      display_name: '处理后样品',
      type: 'ResourceSlot',
      required: false,
      data_source: 'result',
      data_key: 'sample',
      meta_data: {
        unilab: {
          value_schema: { $slot: 'ResourceSlot' },
          editor_control: 'material_port',
          allowed_resource_template_uuids: [resourceTemplateUuid],
          implicit_passthrough: true
        }
      }
    }
  ]
  return {
    '/api/v1/workflow-node-templates?page=1&page_size=100': {
      code: 0,
      data: {
        authority,
        catalog_fingerprint: fingerprint,
        items: [{
          uuid: nodeUuid,
          name: 'transfer.sample.v1',
          display_name: '转移样品',
          type: 'UniLabJsonCommand',
          node_type: 'device',
          resource_template: {
            uuid: resourceTemplateUuid,
            name: 'community.szlab.pump',
            display_name: 'SZLab Pump'
          }
        }],
        total: 1,
        page: 1,
        page_size: 20
      }
    },
    [`/api/v1/workflow-node-templates/${nodeUuid}`]: {
      code: 0,
      data: {
        authority,
        catalog_fingerprint: fingerprint,
        template: {
          uuid: nodeUuid,
          resource_template_uuid: resourceTemplateUuid,
          name: 'transfer.sample.v1',
          display_name: '转移样品',
          class: 'szlab.devices.pump:Pump',
          type: 'UniLabJsonCommand',
          node_type: 'device',
          schema: actionSchema(),
          goal: { sample: 'sample', mode: 'mode' },
          goal_default: { mode: 'safe' },
          feedback: {},
          result: { sample: 'sample' },
          meta_data: {}
        },
        handles
      }
    }
  }
}

function fixtureHttp(
  responses: Record<string, unknown>,
  requests: string[] = []
): HttpClient {
  return {
    request: async <ResponseValue>(path: string): Promise<ResponseValue> => {
      requests.push(path)
      if (!(path in responses)) throw new Error(`Unexpected request: ${path}`)
      return structuredClone(responses[path]) as ResponseValue
    }
  }
}
