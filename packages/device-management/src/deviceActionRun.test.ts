import { describe, expect, it } from 'vitest'
import type {
  DeviceAction,
  WorkflowActionCatalogSnapshot,
  WorkflowActionNodeTemplate
} from '@unilab/services'

import {
  matchDeviceActionTemplate,
  serializeDeviceActionInput,
  supportsD1AS1
} from './deviceActionRun'

describe('device Action D1A preparation', () => {
  it('joins live Action to exactly one stable A1 identity', () => {
    const template = actionTemplate()
    const catalog = actionCatalog([template])

    expect(matchDeviceActionTemplate(catalog, liveAction())).toBe(template)
    expect(matchDeviceActionTemplate(
      actionCatalog([template, { ...template, uuid: UUID_2 }]),
      liveAction()
    )).toBeNull()
    expect(matchDeviceActionTemplate(catalog, {
      ...liveAction(),
      typeName: 'other.Action'
    })).toBeNull()
  })

  it('fails closed for material, Site and implicit pass-through contracts', () => {
    expect(supportsD1AS1(actionTemplate())).toBe(true)
    expect(supportsD1AS1(actionTemplate({
      editorControl: 'material_port'
    }))).toBe(false)
    expect(supportsD1AS1(actionTemplate({
      editorControl: 'site_selector'
    }))).toBe(false)
    expect(supportsD1AS1(actionTemplate({
      implicitPassthrough: true
    }))).toBe(false)
    expect(supportsD1AS1(actionTemplate({
      valueSchema: { $slot: 'ResourceSlot', type: 'object' }
    }))).toBe(false)
  })

  it('serializes the existing form without convenient coercion beyond its schema', () => {
    const action = liveAction()
    action.inputSchema = {
      count: { type: 'integer', required: true },
      speed: { type: 'number', required: true },
      enabled: { type: 'boolean', required: true },
      labels: { type: 'array', required: true },
      options: { type: 'object', required: true },
      note: { type: 'string', required: false }
    }

    expect(serializeDeviceActionInput(action, {
      count: '2',
      speed: '1.5',
      enabled: true,
      labels: '["a"]',
      options: '{"safe":true}',
      note: ''
    })).toEqual({
      count: 2,
      speed: 1.5,
      enabled: true,
      labels: ['a'],
      options: { safe: true }
    })

    expect(() => serializeDeviceActionInput(action, {
      count: '2.5',
      speed: '1.5',
      enabled: true,
      labels: '["a"]',
      options: '{"safe":true}'
    })).toThrow('count 必须是整数')
    expect(() => serializeDeviceActionInput(action, {
      count: '2',
      speed: '1.5',
      enabled: true,
      labels: '{}',
      options: '{"safe":true}'
    })).toThrow('labels 必须是数组')
  })

  it('uses a declared schema default instead of silently delegating a cleared field to the backend', () => {
    const action = liveAction()
    action.inputSchema = {
      duration: { type: 'number', required: false, default: 30 }
    }

    expect(serializeDeviceActionInput(action, { duration: '' })).toEqual({
      duration: 30
    })
  })

  it('submits only fields declared by the frozen Action template', () => {
    const action = liveAction()
    action.inputSchema = {
      unilabos_device_id: { type: 'string', default: '' },
      sample_id: { type: 'string', default: '' },
      require_material: { type: 'boolean', default: false }
    }
    const template = {
      ...actionTemplate(),
      goal: {
        sample_id: 'sample_id',
        require_material: 'require_material'
      }
    }

    expect(serializeDeviceActionInput(action, {
      unilabos_device_id: '',
      sample_id: 'debug-sample',
      require_material: false
    }, template)).toEqual({
      sample_id: 'debug-sample',
      require_material: false
    })
  })
})

const UUID_1 = '10000000-0000-4000-8000-000000000001'
const UUID_2 = '10000000-0000-4000-8000-000000000002'
const RESOURCE_UUID = '10000000-0000-4000-8000-000000000003'

function liveAction(): DeviceAction {
  return {
    actionName: 'move',
    actionRef: 'robot.move',
    displayName: '移动',
    label: '移动',
    typeName: 'demo.Move',
    isBusy: false,
    currentJobId: null,
    schema: null,
    inputSchema: {},
    outputSchema: {},
    riskLevel: 'normal'
  }
}

function actionCatalog(
  actionTemplates: WorkflowActionNodeTemplate[]
): WorkflowActionCatalogSnapshot {
  return {
    authorityId: 'os-local',
    authorityKind: 'local',
    fingerprint: `sha256:${'a'.repeat(64)}`,
    actionTemplates,
    workflowTemplates: []
  }
}

function actionTemplate(
  handle: Partial<WorkflowActionNodeTemplate['handles'][number]> = {}
): WorkflowActionNodeTemplate {
  return {
    uuid: UUID_1,
    resourceTemplateUuid: RESOURCE_UUID,
    name: 'move',
    displayName: '移动',
    actionClass: null,
    actionType: 'demo.Move',
    schema: { 'x-unilabos-action-contract': { version: 1 } },
    goal: {},
    goalDefault: {},
    handles: [{
      uuid: UUID_2,
      workflowNodeTemplateUuid: UUID_1,
      handleKey: 'position',
      ioType: 'target',
      displayName: 'Position',
      valueType: 'string',
      required: true,
      dataSource: null,
      dataKey: 'position',
      valueSchema: { type: 'string' },
      editorControl: 'variable_selector',
      allowedResourceTemplateUuids: null,
      implicitPassthrough: false,
      structuralRole: null,
      ...handle
    }]
  }
}
