import type { WorkflowRevision } from '@unilab/services'
import type {
  WorkflowLink,
  WorkflowNode,
  WorkflowStructure
} from './parseWorkflow'

export interface CanonicalWorkflowParseResult extends WorkflowStructure {
  revision: WorkflowRevision | null
}

export function parseCanonicalWorkflow(
  text: string
): CanonicalWorkflowParseResult {
  const empty: CanonicalWorkflowParseResult = {
    revision: null,
    nodes: [],
    links: [],
    steps: [],
    error: null
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : 'JSON 解析失败'
    }
  }
  if (!isRecord(value)) return { ...empty, error: '工作流必须是 JSON 对象' }
  const revision = value as WorkflowRevision
  if (
    revision.schema_version !== '2' ||
    !revision.workflow_id ||
    !revision.revision_id ||
    !Array.isArray(revision.invocations) ||
    !Array.isArray(revision.control_edges)
  ) {
    return { ...empty, error: '不是 Canonical WorkflowRevision v2' }
  }
  const layout = isRecord(revision.layout) ? revision.layout : {}
  const layoutNodes = isRecord(layout.nodes) ? layout.nodes : {}
  const nodes: WorkflowNode[] = revision.invocations.map((invocation) => {
    const position = isRecord(layoutNodes[invocation.node_id])
      ? layoutNodes[invocation.node_id] as Record<string, unknown>
      : {}
    const nodeType = String(invocation.node_type || 'action')
    return {
      id: invocation.node_id,
      name: String(invocation.name || invocation.action_ref),
      type: nodeType,
      className: invocation.action_ref,
      labNodeType: nodeType,
      x: finite(position.x),
      y: finite(position.y)
    }
  })
  const links: WorkflowLink[] = revision.control_edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: 'control',
    branch: edge.branch
  }))
  return {
    revision,
    nodes,
    links,
    steps: revision.invocations.map((invocation) => ({
      action: invocation.action_ref,
      args: isRecord(invocation.input_bindings)
        ? invocation.input_bindings
        : {},
      schema: null
    })),
    error: null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

export const CONTROL_DAG_REVISION: WorkflowRevision = {
  schema_version: '2',
  revision_id: 'control-demo-rev-1',
  workflow_id: 'control-demo',
  invocations: [
    {
      node_id: 'measure',
      action_ref: 'balance-1.measure',
      name: '称量样品'
    },
    {
      node_id: 'branch',
      action_ref: 'os_control.branch',
      node_type: 'branch',
      name: '质量是否合格？',
      input_bindings: {
        condition: { kind: 'literal', value: true }
      }
    },
    {
      node_id: 'dose',
      action_ref: 'pump-1.dose',
      name: '合格：定量加液',
      input_bindings: {
        volume: { kind: 'literal', value: 5 }
      }
    },
    {
      node_id: 'inspect',
      action_ref: 'camera-1.inspect',
      name: '不合格：视觉复检'
    },
    {
      node_id: 'join',
      action_ref: 'os_control.join',
      node_type: 'join',
      name: '分支汇合'
    },
    {
      node_id: 'heat',
      action_ref: 'heater-1.heat',
      name: '加热至 60°C',
      input_bindings: {
        temperature: { kind: 'literal', value: 60 }
      }
    }
  ],
  control_edges: [
    { edge_id: 'e1', source: 'measure', target: 'branch' },
    {
      edge_id: 'e2',
      source: 'branch',
      target: 'dose',
      branch: 'true'
    },
    {
      edge_id: 'e3',
      source: 'branch',
      target: 'inspect',
      branch: 'false'
    },
    { edge_id: 'e4', source: 'dose', target: 'join' },
    { edge_id: 'e5', source: 'inspect', target: 'join' },
    { edge_id: 'e6', source: 'join', target: 'heat' }
  ],
  layout: {
    nodes: {
      measure: { x: 30, y: 170 },
      branch: { x: 245, y: 170 },
      dose: { x: 465, y: 70 },
      inspect: { x: 465, y: 275 },
      join: { x: 690, y: 170 },
      heat: { x: 905, y: 170 }
    }
  }
}

export const CONTROL_DAG_JSON = JSON.stringify(
  CONTROL_DAG_REVISION,
  null,
  2
)
