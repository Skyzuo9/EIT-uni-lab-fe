import type { DebugWorkflowTaskPreflight } from '@unilab/services'
import { describe, expect, it } from 'vitest'

import {
  buildDebugLaunchOverrides,
  createDebugLaunchInputForm,
  setDebugLaunchField
} from './debugLaunchInputForm'

const preflight: DebugWorkflowTaskPreflight = {
  workflow_uuid: '10000000-0000-4000-8000-000000000001',
  workflow_revision: 7,
  status: 'needs_input',
  preflight_hash: `sha256:${'a'.repeat(64)}`,
  diagnostics: [],
  launch_overrides: [],
  requirements: [
    {
      id: 'ordinary',
      kind: 'value',
      reason: 'start_scope',
      required: true,
      target: {
        node_uuid: 'node-value',
        node_name: '消费计数',
        handle_uuid: 'handle-value',
        data_key: 'count',
        display_name: '计数'
      },
      schema: { type: 'integer' },
      upstream_nodes: [],
      suggestions: []
    },
    {
      id: 'material',
      kind: 'material',
      reason: 'disabled_node',
      required: true,
      target: {
        node_uuid: 'node-material',
        node_name: '消费样品',
        handle_uuid: 'handle-material',
        data_key: 'sample',
        display_name: '样品'
      },
      schema: {
        $slot: 'ResourceSlot',
        allowed_resource_template_uuids: ['template-plate']
      },
      upstream_nodes: [{
        node_uuid: 'node-skipped',
        node_name: '跳过搬运',
        disabled: true
      }],
      allowed_resource_template_uuids: ['template-plate'],
      suggestions: [{
        id: 'suggestion-1',
        material_uuid: 'material-1',
        material_name: '样品板 A',
        resource_template_uuid: 'template-plate',
        recommended: true,
        requires_confirmation: true,
        actual: {
          site: { uuid: 'site-actual', name: '酒店位 1' },
          status: 'available'
        },
        inferred_target: {
          kind: 'same_material_passthrough',
          through_node_uuids: ['node-skipped'],
          site: null,
          status: null
        }
      }]
    }
  ]
}

describe('Debug launch guided inputs', () => {
  it('prefills a proven same-material suggestion but still requires visible confirmation', () => {
    const form = setDebugLaunchField(
      createDebugLaunchInputForm(preflight),
      'ordinary',
      { valueText: '7', confirmed: false }
    )

    expect(form.fields[1]).toMatchObject({
      requirement: { id: 'material' },
      valueText: 'material-1',
      confirmed: false
    })
    expect(() => buildDebugLaunchOverrides(form))
      .toThrow('请确认物料的实际库位与状态')
  })

  it('builds typed ordinary values and confirmed material UUIDs', () => {
    let form = createDebugLaunchInputForm(preflight)
    form = setDebugLaunchField(form, 'ordinary', {
      valueText: '7',
      confirmed: false
    })
    form = setDebugLaunchField(form, 'material', {
      valueText: 'material-1',
      confirmed: true
    })

    expect(buildDebugLaunchOverrides(form)).toEqual([
      { requirement_id: 'ordinary', value: 7 },
      {
        requirement_id: 'material',
        value: { uuid: 'material-1' },
        confirmed: true
      }
    ])
  })

  it('rejects malformed ordinary JSON before any launch request', () => {
    let form = createDebugLaunchInputForm(preflight)
    form = setDebugLaunchField(form, 'ordinary', {
      valueText: 'not-json',
      confirmed: false
    })

    expect(() => buildDebugLaunchOverrides(form))
      .toThrow('消费计数 / 计数 不是有效 JSON')
  })

  it('retains overrides already accepted by a partial OS preflight', () => {
    const partial = structuredClone(preflight)
    partial.requirements = [preflight.requirements[1]]
    partial.launch_overrides = [{
      requirement_id: 'ordinary',
      target_node_uuid: 'node-value',
      target_handle_uuid: 'handle-value',
      value: 7,
      confirmed: false
    }]
    let form = createDebugLaunchInputForm(partial)
    form = setDebugLaunchField(form, 'material', {
      valueText: 'material-1',
      confirmed: true
    })

    expect(buildDebugLaunchOverrides(form)).toEqual([
      { requirement_id: 'ordinary', value: 7 },
      {
        requirement_id: 'material',
        value: { uuid: 'material-1' },
        confirmed: true
      }
    ])
  })
})
