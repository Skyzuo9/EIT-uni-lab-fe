import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type {
  WorkflowActionCatalogSnapshot,
  WorkflowAuthoringGraph
} from '@unilab/services'

import {
  connectTypedActionEdge,
  createTypedActionNode,
  projectTypedActionEditor,
  rehydrateTypedActionGraph,
  updateTypedActionLiteral
} from './workflowActionCatalog'
import { catalogConflictDecision } from './persistentAuthoringSession'

const templateUuid = '20000000-0000-4000-8000-000000000001'
const sourceTemplateUuid = '20000000-0000-4000-8000-000000000002'
const nodeUuid = '40000000-0000-4000-8000-000000000001'
const sourceNodeUuid = '40000000-0000-4000-8000-000000000002'
const secondNodeUuid = '40000000-0000-4000-8000-000000000003'
const workflowUuid = '60000000-0000-4000-8000-000000000001'
const requiredHandleUuid = '30000000-0000-4000-8000-000000000001'
const defaultHandleUuid = '30000000-0000-4000-8000-000000000002'
const nullableHandleUuid = '30000000-0000-4000-8000-000000000003'
const enumHandleUuid = '30000000-0000-4000-8000-000000000004'
const objectHandleUuid = '30000000-0000-4000-8000-000000000005'
const listHandleUuid = '30000000-0000-4000-8000-000000000006'
const materialHandleUuid = '30000000-0000-4000-8000-000000000007'
const siteHandleUuid = '30000000-0000-4000-8000-000000000008'
const upstreamHandleUuid = '30000000-0000-4000-8000-000000000009'
const fingerprint = `sha256:${'a'.repeat(64)}`

describe('typed Action editor projection', () => {
  it('creates a Backend-shaped Node from canonical template defaults', () => {
    const emptyGraph: WorkflowAuthoringGraph = {
      ...graph,
      nodes: [],
      edges: []
    }
    const created = createTypedActionNode(catalog, emptyGraph, {
      nodeUuid: '40000000-0000-4000-8000-000000000003',
      templateUuid,
      name: 'transfer_2'
    })

    expect(created.nodes).toEqual([{
      uuid: '40000000-0000-4000-8000-000000000003',
      workflow_node_template_uuid: templateUuid,
      name: 'transfer_2',
      status: 'idle',
      type: 'device',
      pose: {},
      param: { temperature: 25, mode: 'safe', note: null },
      action_name: 'transfer',
      execution_policy: {},
      disabled: false,
      minimized: false,
      meta_data: {
        unilab: {
          input_bindings: {}
        }
      }
    }])
    expect(created.nodes[0]?.param).not.toHaveProperty('options')
    expect(() => createTypedActionNode(catalog, emptyGraph, {
      nodeUuid: '40000000-0000-4000-8000-000000000004',
      templateUuid: '20000000-0000-4000-8000-000000000099',
      name: 'unknown'
    })).toThrow(/template/i)

    const catalogWithAuto: WorkflowActionCatalogSnapshot = {
      ...catalog,
      nodeTemplates: [
        ...catalog.nodeTemplates,
        {
          ...actionTemplate(),
          uuid: '20000000-0000-4000-8000-000000000003',
          name: 'auto-health',
          schema: {}
        }
      ]
    }
    expect(() => createTypedActionNode(catalogWithAuto, emptyGraph, {
      nodeUuid: '40000000-0000-4000-8000-000000000005',
      templateUuid: '20000000-0000-4000-8000-000000000003',
      name: 'health'
    })).toThrow(/typed|action|template/i)
  })

  it('preserves required/default/null/enum/object/list/ResourceSlot semantics', () => {
    const projected = projectTypedActionEditor(
      catalog,
      graph,
      nodeUuid,
      []
    )

    expect(projected.templateUuid).toBe(templateUuid)
    expect(projected.fields.map((field) => ({
      handleUuid: field.handleUuid,
      dataKey: field.dataKey,
      required: field.required,
      hasDefault: field.hasDefault,
      defaultValue: field.defaultValue,
      nullable: field.nullable,
      editorControl: field.editorControl,
      valueState: field.valueState,
      enumValues: field.enumValues
    }))).toEqual([
      {
        handleUuid: requiredHandleUuid,
        dataKey: 'count',
        required: true,
        hasDefault: false,
        defaultValue: undefined,
        nullable: false,
        editorControl: 'variable_selector',
        valueState: 'missing',
        enumValues: null
      },
      {
        handleUuid: defaultHandleUuid,
        dataKey: 'temperature',
        required: false,
        hasDefault: true,
        defaultValue: 25,
        nullable: false,
        editorControl: 'variable_selector',
        valueState: 'missing',
        enumValues: null
      },
      {
        handleUuid: nullableHandleUuid,
        dataKey: 'note',
        required: false,
        hasDefault: true,
        defaultValue: null,
        nullable: true,
        editorControl: 'variable_selector',
        valueState: 'null',
        enumValues: null
      },
      {
        handleUuid: enumHandleUuid,
        dataKey: 'mode',
        required: false,
        hasDefault: true,
        defaultValue: 'safe',
        nullable: false,
        editorControl: 'variable_selector',
        valueState: 'missing',
        enumValues: ['safe', 'fast']
      },
      {
        handleUuid: objectHandleUuid,
        dataKey: 'options',
        required: false,
        hasDefault: false,
        defaultValue: undefined,
        nullable: false,
        editorControl: 'variable_selector',
        valueState: 'value',
        enumValues: null
      },
      {
        handleUuid: listHandleUuid,
        dataKey: 'samples',
        required: false,
        hasDefault: false,
        defaultValue: undefined,
        nullable: false,
        editorControl: 'variable_selector',
        valueState: 'value',
        enumValues: null
      },
      {
        handleUuid: materialHandleUuid,
        dataKey: 'material',
        required: true,
        hasDefault: false,
        defaultValue: undefined,
        nullable: false,
        editorControl: 'material_port',
        valueState: 'missing',
        enumValues: null
      },
      {
        handleUuid: siteHandleUuid,
        dataKey: 'site',
        required: false,
        hasDefault: false,
        defaultValue: undefined,
        nullable: false,
        editorControl: 'site_selector',
        valueState: 'missing',
        enumValues: null
      }
    ])
    expect(projected.diagnostics).toEqual([
      expect.objectContaining({
        handleUuid: requiredHandleUuid,
        fieldPath: '/param/count',
        severity: 'error'
      }),
      expect.objectContaining({
        handleUuid: materialHandleUuid,
        fieldPath: '/param/material',
        severity: 'error'
      })
    ])
    expect(graph.nodes[0]?.param).toEqual({
      note: null,
      options: {},
      samples: []
    })
    expect(graph.nodes[0]?.param).not.toHaveProperty('temperature')
    expect(graph.nodes[0]?.param).not.toHaveProperty('mode')
  })

  it('does not collapse missing, null, empty object, or empty list on update', () => {
    const withValue = updateTypedActionLiteral(
      catalog,
      graph,
      nodeUuid,
      requiredHandleUuid,
      0
    )
    const withNull = updateTypedActionLiteral(
      catalog,
      withValue,
      nodeUuid,
      nullableHandleUuid,
      null
    )
    const withEmptyObject = updateTypedActionLiteral(
      catalog,
      withNull,
      nodeUuid,
      objectHandleUuid,
      {}
    )
    const withEmptyList = updateTypedActionLiteral(
      catalog,
      withEmptyObject,
      nodeUuid,
      listHandleUuid,
      []
    )
    const cleared = updateTypedActionLiteral(
      catalog,
      withEmptyList,
      nodeUuid,
      nullableHandleUuid,
      undefined
    )

    expect(cleared.nodes[0]?.param).toEqual({
      count: 0,
      options: {},
      samples: []
    })
    expect(withEmptyList.nodes[0]?.param).not.toHaveProperty('temperature')
    expect(() => updateTypedActionLiteral(
      catalog,
      graph,
      nodeUuid,
      materialHandleUuid,
      'material-1'
    )).toThrow(/typed Action schema/)
  })

  it('creates and rehydrates edges only by real Handle UUID', () => {
    const occupiedGraph: WorkflowAuthoringGraph = {
      ...graph,
      nodes: graph.nodes.map((node) => node.uuid !== nodeUuid
        ? node
        : {
            ...node,
            param: {
              ...(node.param as Record<string, unknown> || {}),
              material: { uuid: 'material-1' }
            },
            meta_data: {
              unilab: {
                input_bindings: {
                  [materialHandleUuid]: { parameter: 'sample' }
                }
              }
            }
          })
    }
    const connected = connectTypedActionEdge(catalog, occupiedGraph, {
      sourceNodeUuid,
      sourceHandleUuid: upstreamHandleUuid,
      targetNodeUuid: nodeUuid,
      targetHandleUuid: materialHandleUuid
    })
    const roundTripped = rehydrateTypedActionGraph(
      catalog,
      JSON.parse(JSON.stringify(connected)) as WorkflowAuthoringGraph
    )

    expect(roundTripped.edges).toEqual([
      expect.objectContaining({
        uuid: '4fa4270e-168f-5bd4-a2e5-1f6da91cf55d',
        source_node_uuid: sourceNodeUuid,
        source_handle_uuid: upstreamHandleUuid,
        target_node_uuid: nodeUuid,
        target_handle_uuid: materialHandleUuid
      })
    ])
    expect(roundTripped.nodes[0]?.workflow_node_template_uuid)
      .toBe(templateUuid)
    expect(roundTripped.node_templates.map((item) => item.uuid)).toEqual([
      templateUuid,
      sourceTemplateUuid
    ])
    expect(roundTripped.handle_templates.map((item) => item.uuid))
      .toContain(materialHandleUuid)
    expect(roundTripped.nodes[0]?.param).not.toHaveProperty('material')
    expect(
      (roundTripped.nodes[0]?.meta_data as Record<string, unknown>)?.unilab
    ).toEqual(expect.objectContaining({ input_bindings: {} }))
    expect(occupiedGraph.nodes[0]?.param).toEqual(expect.objectContaining({
      material: { uuid: 'material-1' }
    }))
    expect(
      (occupiedGraph.nodes[0]?.meta_data as {
        unilab: { input_bindings: Record<string, unknown> }
      }).unilab.input_bindings
    ).toHaveProperty(materialHandleUuid)
    const withLiteralProvider = updateTypedActionLiteral(
      catalog,
      connected,
      nodeUuid,
      materialHandleUuid,
      { uuid: 'material-2' }
    )
    expect(withLiteralProvider.edges).toEqual([])
    expect(withLiteralProvider.nodes[0]?.param).toEqual(expect.objectContaining({
      material: { uuid: 'material-2' }
    }))
    expect(
      (withLiteralProvider.nodes[0]?.meta_data as {
        unilab: { input_bindings: Record<string, unknown> }
      }).unilab.input_bindings
    ).not.toHaveProperty(materialHandleUuid)
    expect(connected.edges).toHaveLength(1)
    expect(() => connectTypedActionEdge(catalog, connected, {
      sourceNodeUuid,
      sourceHandleUuid: upstreamHandleUuid,
      targetNodeUuid: nodeUuid,
      targetHandleUuid: materialHandleUuid
    })).toThrow('Action target Handle 已有 provider')
  })

  it('scopes edge providers by Node instance and suppresses provided diagnostics', () => {
    const twoTargets: WorkflowAuthoringGraph = {
      ...graph,
      nodes: [
        ...graph.nodes.map((node) => node.uuid !== nodeUuid
          ? node
          : {
              ...node,
              meta_data: {
                unilab: {
                  input_bindings: {
                    [requiredHandleUuid]: { workflow_input_uuid: 'input-count' }
                  }
                }
              }
            }),
        {
          ...graph.nodes[0]!,
          uuid: secondNodeUuid,
          name: 'transfer_2'
        }
      ]
    }
    const firstConnected = connectTypedActionEdge(catalog, twoTargets, {
      sourceNodeUuid,
      sourceHandleUuid: upstreamHandleUuid,
      targetNodeUuid: nodeUuid,
      targetHandleUuid: materialHandleUuid
    })
    const bothConnected = connectTypedActionEdge(catalog, firstConnected, {
      sourceNodeUuid,
      sourceHandleUuid: upstreamHandleUuid,
      targetNodeUuid: secondNodeUuid,
      targetHandleUuid: materialHandleUuid
    })

    expect(bothConnected.edges).toHaveLength(2)
    expect(projectTypedActionEditor(
      catalog,
      bothConnected,
      nodeUuid,
      []
    ).diagnostics).toEqual([])
    expect(() => connectTypedActionEdge(catalog, bothConnected, {
      sourceNodeUuid,
      sourceHandleUuid: upstreamHandleUuid,
      targetNodeUuid: nodeUuid,
      targetHandleUuid: materialHandleUuid
    })).toThrow('Action target Handle 已有 provider')
  })

  it('retains both dirty buffers after a catalog fingerprint conflict', () => {
    expect(catalogConflictDecision({
      dirty: true,
      localPython: 'pump.transfer(mode="fast")\n',
      localGraph: graph,
      observedFingerprint: fingerprint,
      currentFingerprint: `sha256:${'b'.repeat(64)}`
    })).toEqual({
      kind: 'refresh_catalog_and_recompile',
      retainLocalPython: 'pump.transfer(mode="fast")\n',
      retainLocalGraph: graph,
      clearDirty: false
    })
  })

  it('the original Persistent panel owns Catalog load and typed projection', () => {
    const panelPath = fileURLToPath(new URL(
      '../components/PersistentWorkflowAuthoringPanel.tsx',
      import.meta.url
    ))
    const source = readFileSync(panelPath, 'utf8')

    expect(source).toContain('runtime.getWorkflowActionCatalog')
    expect(source).toContain('createTypedActionNode')
    expect(source).toContain('connectTypedActionEdge')
    expect(source).toContain('projectTypedActionEditor')
    expect(source).toContain('data-workflow-handle-template-uuid')
    expect(source).not.toContain('lastIndexOf')
    expect(source).not.toMatch(/split\([^)]*[.][^)]*\)/)
  })
})

const catalog = {
  authorityId: 'os-local',
  authorityKind: 'local',
  fingerprint,
  nodeTemplates: [
    actionTemplate(),
    sourceTemplate()
  ]
} satisfies WorkflowActionCatalogSnapshot

const graph: WorkflowAuthoringGraph = {
  workflow: { uuid: workflowUuid, revision: 1 },
  nodes: [
    {
      uuid: nodeUuid,
      workflow_node_template_uuid: templateUuid,
      name: 'transfer',
      param: {
        note: null,
        options: {},
        samples: []
      }
    },
    {
      uuid: sourceNodeUuid,
      workflow_node_template_uuid: sourceTemplateUuid,
      name: 'source',
      param: {}
    }
  ],
  edges: [],
  node_templates: [],
  handle_templates: []
}

function actionTemplate(): WorkflowActionCatalogSnapshot['nodeTemplates'][number] {
  return {
    uuid: templateUuid,
    resourceTemplateUuid: '10000000-0000-4000-8000-000000000001',
    name: 'transfer',
    displayName: '转移',
    actionClass: 'lab.devices:Pump',
    actionType: 'UniLabJsonCommand',
    schema: canonicalSchema(
      ['count', 'temperature', 'note', 'mode', 'options', 'samples', 'material', 'site'],
      []
    ),
    goal: {},
    goalDefault: { temperature: 25, mode: 'safe', note: null },
    handles: [
      handle(requiredHandleUuid, 'count', { type: 'integer' }, true),
      handle(defaultHandleUuid, 'temperature', {
        type: 'number', default: 25
      }),
      handle(nullableHandleUuid, 'note', {
        anyOf: [{ type: 'string' }, { type: 'null' }], default: null
      }),
      handle(enumHandleUuid, 'mode', {
        type: 'string', enum: ['safe', 'fast'], default: 'safe'
      }),
      handle(objectHandleUuid, 'options', {
        type: 'object', additionalProperties: true
      }),
      handle(listHandleUuid, 'samples', {
        type: 'array', items: { type: 'integer' }
      }),
      handle(materialHandleUuid, 'material', { $slot: 'ResourceSlot' }, true, 'material_port'),
      handle(siteHandleUuid, 'site', { type: 'string' }, false, 'site_selector')
    ]
  }
}

function sourceTemplate(): WorkflowActionCatalogSnapshot['nodeTemplates'][number] {
  return {
    uuid: sourceTemplateUuid,
    resourceTemplateUuid: '10000000-0000-4000-8000-000000000002',
    name: 'source',
    displayName: '来源',
    actionClass: 'lab.devices:Source',
    actionType: 'UniLabJsonCommand',
    schema: canonicalSchema([], ['material']),
    goal: {},
    goalDefault: {},
    handles: [{
      ...handle(upstreamHandleUuid, 'material', { $slot: 'ResourceSlot' }),
      workflowNodeTemplateUuid: sourceTemplateUuid,
      ioType: 'source',
      dataSource: 'result'
    }]
  }
}

function canonicalSchema(
  inputOrder: string[],
  outputOrder: string[]
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      goal: { type: 'object' },
      feedback: {},
      result: { type: 'object' }
    },
    'x-unilabos-action-contract': {
      version: 1,
      input_order: inputOrder,
      output_order: outputOrder,
      resource_template_symbols: { goal: {}, result: {} }
    }
  }
}

function handle(
  uuid: string,
  key: string,
  valueSchema: Record<string, unknown>,
  required = false,
  editorControl: 'material_port' | 'site_selector' | 'variable_selector' =
    'variable_selector'
): WorkflowActionCatalogSnapshot['nodeTemplates'][number]['handles'][number] {
  return {
    uuid,
    workflowNodeTemplateUuid: templateUuid,
    handleKey: key,
    ioType: 'target',
    displayName: key,
    valueType: valueSchema.$slot === 'ResourceSlot'
      ? 'ResourceSlot'
      : String(valueSchema.type || 'object'),
    required,
    dataSource: 'goal',
    dataKey: key,
    valueSchema,
    editorControl,
    allowedResourceTemplateUuids: editorControl === 'material_port'
      ? ['10000000-0000-4000-8000-000000000001']
      : null,
    implicitPassthrough: false,
    structuralRole: null
  }
}
