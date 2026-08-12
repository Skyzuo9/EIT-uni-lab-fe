import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { createDebugLaunchInputForm } from '../utils/debugLaunchInputForm'
import { DebugLaunchInputForm } from './DebugLaunchInputForm'

describe('DebugLaunchInputForm', () => {
  it('shows inventory facts and labels inferred state as a suggestion requiring confirmation', () => {
    const form = createDebugLaunchInputForm({
      workflow_uuid: 'workflow-1',
      workflow_revision: 7,
      status: 'needs_input',
      preflight_hash: `sha256:${'a'.repeat(64)}`,
      diagnostics: [],
      launch_overrides: [],
      requirements: [{
        id: 'material-1',
        kind: 'material',
        reason: 'disabled_node',
        required: true,
        target: {
          node_uuid: 'node-consumer',
          node_name: '下游取样',
          handle_uuid: 'handle-sample',
          data_key: 'sample',
          display_name: '样品'
        },
        schema: {
          $slot: 'ResourceSlot',
          allowed_resource_template_uuids: ['template-plate']
        },
        upstream_nodes: [{
          node_uuid: 'node-disabled',
          node_name: '已禁用转运',
          disabled: true
        }],
        allowed_resource_template_uuids: ['template-plate'],
        suggestions: [{
          id: 'suggestion-1',
          material_uuid: 'material-plate-1',
          material_name: '样品板 A',
          resource_template_uuid: 'template-plate',
          recommended: true,
          requires_confirmation: true,
          actual: {
            site: { uuid: 'site-hotel-1', name: '酒店位 1' },
            status: 'available'
          },
          inferred_target: {
            kind: 'same_material_passthrough',
            through_node_uuids: ['node-disabled'],
            site: null,
            status: null
          }
        }]
      }]
    })

    const markup = renderToStaticMarkup(createElement(DebugLaunchInputForm, {
      form,
      onChange: vi.fn()
    }))

    expect(markup).toContain('material-plate-1')
    expect(markup).toContain('template-plate')
    expect(markup).toContain('酒店位 1')
    expect(markup).toContain('site-hotel-1')
    expect(markup).toContain('available')
    expect(markup).toContain('推断建议')
    expect(markup).toContain('不会改写库存')
    expect(markup).toContain('我已核对当前物料事实')
  })
})
