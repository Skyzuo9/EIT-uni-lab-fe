import type {
  WorkflowIoMetadata,
  WorkflowOutputBinding,
  WorkflowValueSchema
} from '@unilab/services'

interface WorkflowIoSummaryProps {
  io: WorkflowIoMetadata
}

export function WorkflowIoSummary({
  io
}: WorkflowIoSummaryProps): React.JSX.Element {
  return (
    <section
      className="persistent-authoring__io-summary"
      aria-label="Applied Workflow I/O"
    >
      <ContractList title="Workflow Inputs">
        {io.input_contract.parameters.map((parameter) => (
          <li key={parameter.name}>
            <div className="persistent-authoring__io-name">
              <code>{parameter.name}</code>
              <span>{schemaLabel(parameter.schema)}</span>
            </div>
            <div className="persistent-authoring__io-properties">
              <span>{parameter.required ? '必填 required' : '可选 optional'}</span>
              {'default' in parameter && (
                <span>默认值: {jsonLabel(parameter.default)}</span>
              )}
              {isNullable(parameter.schema) && <span>可空 nullable</span>}
            </div>
          </li>
        ))}
      </ContractList>

      <ContractList title="Workflow Outputs">
        {io.output_contract.outputs.map((output) => (
          <li key={output.name}>
            <div className="persistent-authoring__io-name">
              <code>{output.name}</code>
              <span>{schemaLabel(output.schema)}</span>
            </div>
            <div className="persistent-authoring__io-properties">
              {output.implicit && <span>隐式 implicit</span>}
              <span>{bindingLabel(io.output_bindings[output.name])}</span>
            </div>
          </li>
        ))}
      </ContractList>
    </section>
  )
}

function ContractList({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section>
      <h3>{title}</h3>
      <ol>{children}</ol>
    </section>
  )
}

function bindingLabel(binding: WorkflowOutputBinding | undefined): string {
  if (!binding) return 'binding unavailable'
  if (binding.kind === 'workflow_input') {
    return `workflow_input · parameter: ${binding.parameter}`
  }
  return [
    'node_output',
    `node: ${binding.workflow_node_uuid}`,
    `handle: ${binding.source_handle_uuid}`
  ].join(' · ')
}

function isNullable(schema: WorkflowValueSchema): boolean {
  return 'anyOf' in schema
}

function schemaLabel(schema: WorkflowValueSchema): string {
  if ('anyOf' in schema) return `${schemaLabel(schema.anyOf[0])} | null`
  if ('$slot' in schema) return schema.$slot
  if (schema.type === 'array') return `list[${schemaLabel(schema.items)}]`
  return schema.type
}

function jsonLabel(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  const encoded = JSON.stringify(value)
  return encoded === undefined ? 'undefined' : encoded
}
