import type { WorkflowAuthoringAggregate } from '@unilab/services'
import { ServiceError } from '@unilab/services'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { WorkflowTaskInputForm } from './WorkflowTaskInputForm'

interface ProblemModule {
  workflowTaskInputProblem(error: unknown): string
}

const modulePath = '../utils/workflowTaskInputProblem'
const problemModule = await import(/* @vite-ignore */ modulePath)
  .catch(() => ({})) as Partial<ProblemModule>

describe('Workflow ResourceSlot Task rejection feedback', () => {
  it.each([
    {
      status: 400,
      code: 'invalid_input',
      backendMessage: 'Material template is not allowed by ResourceSlot',
      expected: /类型不兼容.*重新选择/i
    },
    {
      status: 404,
      code: 'not_found',
      backendMessage: 'material not found',
      expected: /已不存在.*刷新.*重试/i
    },
    {
      status: 409,
      code: 'conflict',
      backendMessage: 'Material is not runnable',
      expected: /不可用|占用.*重新选择|稍后重试/i
    }
  ])('maps HTTP $status to an actionable form-level alert', ({
    status,
    code,
    backendMessage,
    expected
  }) => {
    expect(problemModule.workflowTaskInputProblem).toBeTypeOf('function')
    const problem = problemModule.workflowTaskInputProblem!(new ServiceError({
      status,
      code,
      message: backendMessage,
      retryable: false
    }))
    const markup = renderToStaticMarkup(createElement(
      WorkflowTaskInputForm,
      {
        aggregate: aggregate(),
        problem,
        onChange: vi.fn()
      }
    ))

    expect(problem).toMatch(expected)
    expect(markup).toMatch(/role="alert"/)
    expect(visibleText(markup)).toMatch(expected)
  })
})

function aggregate(): WorkflowAuthoringAggregate {
  return {
    workflow_uuid: '10000000-0000-4000-8000-000000000005',
    workflow_revision: 1,
    state: 'applied',
    applied_graph: {
      workflow: {
        meta_data: {
          unilab: {
            input_contract: {
              version: 1,
              parameters: [{
                name: 'sample',
                schema: { $slot: 'ResourceSlot' },
                required: true
              }]
            },
            output_contract: { version: 1, outputs: [] },
            output_bindings: {}
          }
        }
      },
      nodes: [],
      edges: [],
      node_templates: [],
      handle_templates: []
    },
    draft: null,
    candidate: null,
    applied_source: null
  }
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
