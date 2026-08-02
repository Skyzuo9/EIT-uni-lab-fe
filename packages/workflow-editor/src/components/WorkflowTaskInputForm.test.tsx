import type { WorkflowAuthoringAggregate } from '@unilab/services'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

interface TaskInputFormProps {
  aggregate: WorkflowAuthoringAggregate
  onChange: (name: string, state: unknown) => void
}

const modulePath = './WorkflowTaskInputForm'
const formModule = await import(/* @vite-ignore */ modulePath)
  .catch(() => ({})) as {
    WorkflowTaskInputForm?: ComponentType<TaskInputFormProps>
  }

describe('WorkflowTaskInputForm Applied projection', () => {
  it('renders the Applied revision, default hints, and three input states', () => {
    expect(formModule.WorkflowTaskInputForm).toBeTypeOf('function')
    const markup = renderToStaticMarkup(createElement(
      formModule.WorkflowTaskInputForm!,
      { aggregate: aggregate(), onChange: vi.fn() }
    ))
    const text = visibleText(markup)

    expect(text).toMatch(/Applied[^0-9]*7|已应用[^0-9]*7/i)
    expect(text).toMatch(/attempts[\s\S]*(default|默认)[^0-9]*3/i)
    expect(markup).toMatch(/untouched|未填写|省略/i)
    expect(markup).toMatch(/explicit[_ -]?null|显式空值/i)
    expect(markup).toMatch(/value|明确值/i)
    expect(text).not.toContain('candidate_only')
  })

  it('fails closed for ResourceSlot until the selector round', () => {
    expect(formModule.WorkflowTaskInputForm).toBeTypeOf('function')
    const markup = renderToStaticMarkup(createElement(
      formModule.WorkflowTaskInputForm!,
      { aggregate: aggregate(), onChange: vi.fn() }
    ))
    const text = visibleText(markup)

    expect(text).toMatch(/sample[\s\S]*(ResourceSlot|资源槽)/i)
    expect(text).toMatch(/暂不支持|尚不可用|后续.*selector|unavailable/i)
    expect(markup).toMatch(/disabled=""|aria-disabled="true"/i)
  })
})

function aggregate(): WorkflowAuthoringAggregate {
  const graph = (parameters: unknown[]) => ({
    workflow: {
      meta_data: {
        unilab: {
          input_contract: { version: 1, parameters },
          output_contract: { version: 1, outputs: [] },
          output_bindings: {}
        }
      }
    },
    nodes: [],
    edges: [],
    node_templates: [],
    handle_templates: []
  })
  return {
    workflow_uuid: '10000000-0000-4000-8000-000000000001',
    workflow_revision: 7,
    state: 'unapplied_graph',
    applied_graph: graph([
      { name: 'count', schema: { type: 'integer' }, required: true },
      {
        name: 'attempts',
        schema: { type: 'integer' },
        required: false,
        default: 3
      },
      {
        name: 'note',
        schema: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        required: false,
        default: null
      },
      { name: 'sample', schema: { $slot: 'ResourceSlot' }, required: true }
    ]),
    draft: null,
    applied_source: null,
    candidate: {
      candidate_hash: 'candidate-8',
      draft_hash: 'draft-8',
      base_workflow_revision: 7,
      graph: graph([
        { name: 'candidate_only', schema: { type: 'string' }, required: true }
      ]),
      normalized_python_source: '',
      source_map: [],
      diagnostics: [],
      changeset: {},
      compiler_version: 'test',
      template_catalog_fingerprint: 'catalog-1'
    }
  } as WorkflowAuthoringAggregate
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
