import type {
  WorkflowAuthoringGraph,
  WorkflowNodeJob,
  WorkflowNodeJobStatus
} from '@unilab/services'

import { workflowNodeVisualKind } from './workflowNodeVisualKind'

export type WorkflowMaterialTransferStatus =
  | 'planned'
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'attention'

export interface WorkflowMaterialTransferEndpoint {
  ownerMaterialId: string
  siteKey: string
}

export interface WorkflowMaterialTransferRoute {
  id: string
  workflowNodeUuid: string
  label: string
  source: WorkflowMaterialTransferEndpoint
  target: WorkflowMaterialTransferEndpoint
  executorId: string
  status: WorkflowMaterialTransferStatus
}

/**
 * 从操作系统（OS）权威编写图与工作流节点作业（WorkflowNodeJob）生成只读
 * 物料（Material）转运路线。只有已发布的标准转运复合工作流可以进入投影。
 */
export function projectWorkflowMaterialTransferRoutes(
  graph: WorkflowAuthoringGraph,
  jobs: readonly WorkflowNodeJob[] = []
): WorkflowMaterialTransferRoute[] {
  const templateByUuid = new Map(
    graph.node_templates.map((template) => [
      stringValue(template.uuid),
      template
    ])
  )
  const nodeByUuid = new Map(
    graph.nodes.map((node) => [stringValue(node.uuid), node])
  )
  const jobsByRoute = new Map<string, WorkflowNodeJob[]>()

  for (const job of jobs) {
    const routeNodeUuid = transferAncestor(
      job.workflow_node_uuid,
      nodeByUuid,
      templateByUuid
    )
    if (!routeNodeUuid) continue
    const routeJobs = jobsByRoute.get(routeNodeUuid) ?? []
    routeJobs.push(job)
    jobsByRoute.set(routeNodeUuid, routeJobs)
  }

  return graph.nodes.flatMap((node) => {
    if (!isTransferNode(node, templateByUuid)) return []
    const workflowNodeUuid = stringValue(node.uuid)
    const param = recordValue(node.param)
    const sourceOwner = resourceIdentity(param.source_warehouse)
    const targetOwner = resourceIdentity(param.target_warehouse)
    const sourceSite = optionalString(param.source_site)
    const targetSite = optionalString(param.target_site)
    const executorId = optionalString(param.target_device)
    if (
      !workflowNodeUuid ||
      !sourceOwner ||
      !targetOwner ||
      !sourceSite ||
      !targetSite ||
      !executorId
    ) return []

    return [{
      id: `workflow-transfer-${workflowNodeUuid}`,
      workflowNodeUuid,
      label: optionalString(node.name) ?? `${sourceSite} → ${targetSite}`,
      source: {
        ownerMaterialId: sourceOwner,
        siteKey: sourceSite
      },
      target: {
        ownerMaterialId: targetOwner,
        siteKey: targetSite
      },
      executorId,
      status: aggregateTransferStatus(jobsByRoute.get(workflowNodeUuid) ?? [])
    }]
  })
}

export function aggregateTransferStatus(
  jobs: readonly Pick<WorkflowNodeJob, 'status'>[]
): WorkflowMaterialTransferStatus {
  if (jobs.length === 0) return 'planned'
  const statuses = new Set(jobs.map((job) => job.status))
  if (
    statuses.has('intervention_required') ||
    statuses.has('execution_unknown')
  ) return 'attention'
  if (statuses.has('failed') || statuses.has('timeout')) return 'failed'
  if (
    statuses.has('running') ||
    statuses.has('dispatched') ||
    statuses.has('cancel_requested')
  ) return 'running'
  if (statuses.has('canceled')) return 'canceled'
  if ([...statuses].every(isSuccessfulStatus)) return 'succeeded'
  return 'pending'
}

function isSuccessfulStatus(status: WorkflowNodeJobStatus): boolean {
  return status === 'succeeded' || status === 'skipped'
}

function transferAncestor(
  nodeUuid: string,
  nodeByUuid: ReadonlyMap<string, Record<string, unknown>>,
  templateByUuid: ReadonlyMap<string, Record<string, unknown>>
): string | null {
  let current = nodeByUuid.get(nodeUuid)
  const visited = new Set<string>()
  while (current) {
    const currentUuid = stringValue(current.uuid)
    if (!currentUuid || visited.has(currentUuid)) return null
    visited.add(currentUuid)
    if (isTransferNode(current, templateByUuid)) return currentUuid
    const parentUuid = optionalString(current.parent_uuid)
    if (!parentUuid) return null
    current = nodeByUuid.get(parentUuid)
  }
  return null
}

function isTransferNode(
  node: Record<string, unknown>,
  templateByUuid: ReadonlyMap<string, Record<string, unknown>>
): boolean {
  const template = templateByUuid.get(
    stringValue(node.workflow_node_template_uuid)
  )
  const metaData = recordValue(template?.meta_data)
  const unilab = recordValue(metaData.unilab)
  const source = recordValue(unilab.workflow_source)
  return workflowNodeVisualKind({
    symbol: optionalString(source.symbol),
    definitionFqid: optionalString(source.definition_fqid)
  }) === 'robot-transfer'
}

function resourceIdentity(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  const record = recordValue(value)
  for (const key of [
    'uuid',
    'material_uuid',
    'resource_uuid',
    'id',
    'value'
  ]) {
    const identity = optionalString(record[key])
    if (identity) return identity
  }
  return null
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function stringValue(value: unknown): string {
  return optionalString(value) ?? ''
}
