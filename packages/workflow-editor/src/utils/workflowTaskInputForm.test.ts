import type {
  WorkflowAuthoringAggregate,
  WorkflowInputDescriptor
} from '@unilab/services'
import { describe, expect, it } from 'vitest'

type FieldState =
  | { kind: 'untouched' }
  | { kind: 'explicit_null' }
  | { kind: 'value'; value: unknown }

interface InputForm {
  appliedRevision: number
  fields: Array<{ descriptor: WorkflowInputDescriptor; state: FieldState }>
}

interface InputFormModule {
  createWorkflowTaskInputForm(
    aggregate: WorkflowAuthoringAggregate
  ): InputForm
  setWorkflowTaskInputField(
    form: InputForm,
    name: string,
    state: FieldState
  ): InputForm
  buildWorkflowTaskInput(form: InputForm): Record<string, unknown>
}

const modulePath = './workflowTaskInputForm'
const formModule = await import(/* @vite-ignore */ modulePath)
  .catch(() => ({})) as Partial<InputFormModule>

describe('WorkflowTaskInputForm pure builder', () => {
  it('projects the ordered Applied contract and never the Candidate contract', () => {
    expect(formModule.createWorkflowTaskInputForm).toBeTypeOf('function')
    const form = formModule.createWorkflowTaskInputForm!(aggregate())

    expect(form.appliedRevision).toBe(7)
    expect(form.fields.map(({ descriptor }) => descriptor.name)).toEqual([
      'count', 'enabled', 'label', 'tags', 'config', 'note', 'attempts'
    ])
    expect(form.fields.map(({ state }) => state.kind)).toEqual(
      Array(7).fill('untouched')
    )
    expect(form.fields.map(({ descriptor }) => descriptor.name))
      .not.toContain('candidate_only')
  })

  it('omits untouched optional/default values and rejects a missing required value', () => {
    expect(formModule.createWorkflowTaskInputForm).toBeTypeOf('function')
    expect(formModule.buildWorkflowTaskInput).toBeTypeOf('function')
    const form = formModule.createWorkflowTaskInputForm!(aggregate())

    expect(() => formModule.buildWorkflowTaskInput!(form))
      .toThrow(/count|required|必填/i)

    const complete = requiredValues(form)
    expect(formModule.buildWorkflowTaskInput!(complete)).toEqual({
      count: 0,
      enabled: false,
      label: '',
      tags: [],
      config: {}
    })
    expect(formModule.buildWorkflowTaskInput!(complete)).not.toHaveProperty('note')
    expect(formModule.buildWorkflowTaskInput!(complete)).not.toHaveProperty('attempts')
  })

  it('retains explicit null and every explicit falsy JSON value', () => {
    expect(formModule.createWorkflowTaskInputForm).toBeTypeOf('function')
    expect(formModule.setWorkflowTaskInputField).toBeTypeOf('function')
    expect(formModule.buildWorkflowTaskInput).toBeTypeOf('function')
    let form = requiredValues(formModule.createWorkflowTaskInputForm!(aggregate()))
    form = formModule.setWorkflowTaskInputField!(
      form,
      'note',
      { kind: 'explicit_null' }
    )

    expect(formModule.buildWorkflowTaskInput!(form)).toEqual({
      count: 0,
      enabled: false,
      label: '',
      tags: [],
      config: {},
      note: null
    })
  })

  it('rejects string coercion for integer and boolean controls', () => {
    expect(formModule.createWorkflowTaskInputForm).toBeTypeOf('function')
    expect(formModule.setWorkflowTaskInputField).toBeTypeOf('function')
    const form = formModule.createWorkflowTaskInputForm!(aggregate())

    expect(() => formModule.setWorkflowTaskInputField!(
      form,
      'count',
      { kind: 'value', value: '0' }
    )).toThrow(/integer|number|类型/i)
    expect(() => formModule.setWorkflowTaskInputField!(
      form,
      'enabled',
      { kind: 'value', value: 'false' }
    )).toThrow(/boolean|类型/i)
  })
})

function requiredValues(initial: InputForm): InputForm {
  let form = initial
  for (const [name, value] of [
    ['count', 0],
    ['enabled', false],
    ['label', ''],
    ['tags', []],
    ['config', {}]
  ] as const) {
    form = formModule.setWorkflowTaskInputField!(
      form,
      name,
      { kind: 'value', value }
    )
  }
  return form
}

function aggregate(): WorkflowAuthoringAggregate {
  const parameters: WorkflowInputDescriptor[] = [
    { name: 'count', schema: { type: 'integer' }, required: true },
    { name: 'enabled', schema: { type: 'boolean' }, required: true },
    { name: 'label', schema: { type: 'string' }, required: true },
    {
      name: 'tags',
      schema: { type: 'array', items: { type: 'string' } },
      required: true
    },
    { name: 'config', schema: { type: 'object' }, required: true },
    {
      name: 'note',
      schema: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      required: false,
      default: null
    },
    {
      name: 'attempts',
      schema: { type: 'integer' },
      required: false,
      default: 3
    }
  ]
  const appliedGraph = graph(parameters)
  return {
    workflow_uuid: '10000000-0000-4000-8000-000000000001',
    workflow_revision: 7,
    state: 'unapplied_graph',
    applied_graph: appliedGraph,
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
  }
}

function graph(parameters: WorkflowInputDescriptor[]) {
  return {
    workflow: {
      meta_data: {
        unilab: {
          input_contract: { version: 1 as const, parameters },
          output_contract: { version: 1 as const, outputs: [] },
          output_bindings: {}
        }
      }
    },
    nodes: [],
    edges: [],
    node_templates: [],
    handle_templates: []
  }
}
