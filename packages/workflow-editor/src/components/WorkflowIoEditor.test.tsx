import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { WorkflowAuthoringGraph } from '@unilab/services'

import { WorkflowIoEditor } from './WorkflowIoEditor'

const targetNodeUuid = '40000000-0000-4000-8000-000000000001'
const sourceNodeUuid = '40000000-0000-4000-8000-000000000002'
const targetTemplateUuid = '20000000-0000-4000-8000-000000000001'
const sourceTemplateUuid = '20000000-0000-4000-8000-000000000002'
const targetHandleUuid = '30000000-0000-4000-8000-000000000001'
const sourceHandleUuid = '30000000-0000-4000-8000-000000000002'

describe('WorkflowIoEditor', () => {
  it('exposes Candidate inputs, outputs, add actions, and stable Handle identity', () => {
    const markup = renderToStaticMarkup(
      <WorkflowIoEditor graph={graph} editable onGraphChange={() => {}} />
    )
    const text = visibleText(markup)

    expect(text).toMatch(/Workflow Inputs/i)
    expect(text).toMatch(/Workflow Outputs/i)
    expect(text).toMatch(/Add Input/i)
    expect(text).toMatch(/Add Output/i)
    expect(text).toContain('count')
    expect(text).toContain('report')
    expect(markup).toContain(`data-workflow-node-uuid="${targetNodeUuid}"`)
    expect(markup).toContain(`data-workflow-node-uuid="${sourceNodeUuid}"`)
    expect(markup).toContain(
      `data-workflow-handle-template-uuid="${targetHandleUuid}"`
    )
    expect(markup).toContain(
      `data-workflow-handle-template-uuid="${sourceHandleUuid}"`
    )
  })

  it('renders implicit ResourceSlot pass-through output as read-only', () => {
    const markup = renderToStaticMarkup(
      <WorkflowIoEditor graph={graph} editable onGraphChange={() => {}} />
    )
    const implicitStart = markup.indexOf('data-workflow-output-name="sample"')
    const implicitMarkup = markup.slice(
      implicitStart,
      markup.indexOf('</li>', implicitStart) + '</li>'.length
    )

    expect(implicitStart).toBeGreaterThanOrEqual(0)
    expect(implicitMarkup).toContain('aria-readonly="true"')
    expect(implicitMarkup).toMatch(/disabled=""|disabled(?=[ >])/)
    expect(visibleText(implicitMarkup)).toMatch(/implicit|隐式/i)
  })
})

const graph: WorkflowAuthoringGraph = {
  workflow: {
    uuid: '60000000-0000-4000-8000-000000000001',
    revision: 7,
    meta_data: {
      unilab: {
        input_contract: {
          version: 1,
          parameters: [
            { name: 'count', schema: { type: 'integer' }, required: true },
            {
              name: 'sample',
              schema: { $slot: 'ResourceSlot' },
              required: true
            }
          ]
        },
        output_contract: {
          version: 1,
          outputs: [
            {
              name: 'report',
              schema: { type: 'object' },
              implicit: false
            },
            {
              name: 'sample',
              schema: { $slot: 'ResourceSlot' },
              implicit: true
            }
          ]
        },
        output_bindings: {
          report: {
            kind: 'node_output',
            workflow_node_uuid: sourceNodeUuid,
            source_handle_uuid: sourceHandleUuid
          },
          sample: { kind: 'workflow_input', parameter: 'sample' }
        }
      }
    }
  },
  nodes: [
    {
      uuid: targetNodeUuid,
      workflow_node_template_uuid: targetTemplateUuid,
      name: 'target',
      param: {},
      meta_data: {
        unilab: {
          input_bindings: {
            [targetHandleUuid]: { parameter: 'count' }
          }
        }
      }
    },
    {
      uuid: sourceNodeUuid,
      workflow_node_template_uuid: sourceTemplateUuid,
      name: 'source',
      param: {},
      meta_data: { unilab: { input_bindings: {} } }
    }
  ],
  edges: [],
  node_templates: [
    { uuid: targetTemplateUuid, name: 'target' },
    { uuid: sourceTemplateUuid, name: 'source' }
  ],
  handle_templates: [
    {
      uuid: targetHandleUuid,
      workflow_node_template_uuid: targetTemplateUuid,
      handle_key: 'target_value',
      io_type: 'target'
    },
    {
      uuid: sourceHandleUuid,
      workflow_node_template_uuid: sourceTemplateUuid,
      handle_key: 'result',
      io_type: 'source'
    }
  ]
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
