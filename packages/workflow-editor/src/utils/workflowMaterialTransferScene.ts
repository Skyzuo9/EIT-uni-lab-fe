import type {
  WorkflowAuthoringGraph,
  WorkflowNodeJob,
  WorkflowNodeJobStatus,
  WorkflowTask
} from '@unilab/services'

import { workflowNodeVisualKind } from './workflowNodeVisualKind'
import { projectPersistentAuthoringGraph } from './persistentAuthoringGraph'
import {
  materialTraceAccent,
  projectMaterialTraces,
  type WorkflowMaterialLineage
} from './workflowMaterialTrace'

export type WorkflowMaterialTransferStatus =
  | 'planned'
  | 'pending'
  | 'running'
  | 'canceling'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'attention'

export interface WorkflowMaterialTransferEndpoint {
  ownerMaterialId: string
  siteKey: string | null
}

export interface WorkflowMaterialTransferRoute {
  id: string
  workflowNodeUuid: string
  label: string
  source: WorkflowMaterialTransferEndpoint
  target: WorkflowMaterialTransferEndpoint
  executorId: string
  status: WorkflowMaterialTransferStatus
  materialRole: string
  materialLineageKey: string
  accent: string
}

/**
 * 从操作系统（OS）权威编写图与工作流节点作业（WorkflowNodeJob）生成只读
 * 物料（Material）转运路线。已发布的标准转运复合工作流与 OS 权威
 * `HostNode.transfer_resource` 记账动作都可以进入投影。
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
  const materialLineageByNode = workflowMaterialLineageByNode(graph)
  const materialPredecessors = materialPredecessorsByNode(graph)

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
    const workflowNodeUuid = stringValue(node.uuid)
    const transferKind = transferNodeKind(node, templateByUuid)
    if (!workflowNodeUuid || !transferKind) return []
    const param = recordValue(node.param)
    const source = transferKind === 'standard'
      ? {
          ownerMaterialId: resourceIdentity(param.source_warehouse),
          siteKey: optionalString(param.source_site)
        }
      : upstreamMaterialLocation(
          workflowNodeUuid,
          nodeByUuid,
          templateByUuid,
          materialPredecessors
        )
    const target = transferKind === 'standard'
      ? {
          ownerMaterialId: resourceIdentity(param.target_warehouse),
          siteKey: optionalString(param.target_site)
        }
      : {
          ownerMaterialId: resourceIdentity(param.mount_resource),
          siteKey: optionalString(param.site)
        }
    const executorId = optionalString(param.target_device)
    if (
      !source?.ownerMaterialId ||
      !target.ownerMaterialId ||
      !executorId
    ) {
      return []
    }
    const lineage = materialLineageByNode.get(workflowNodeUuid)
    const materialLineageKey = lineage?.key ??
      `unclassified:${workflowNodeUuid}`

    return [{
      id: `workflow-transfer-${workflowNodeUuid}`,
      workflowNodeUuid,
      label: optionalString(node.name) ??
        `${source.siteKey ?? source.ownerMaterialId} → ` +
          `${target.siteKey ?? target.ownerMaterialId}`,
      source: {
        ownerMaterialId: source.ownerMaterialId,
        siteKey: source.siteKey
      },
      target: {
        ownerMaterialId: target.ownerMaterialId,
        siteKey: target.siteKey
      },
      executorId,
      status: aggregateTransferStatus(jobsByRoute.get(workflowNodeUuid) ?? []),
      materialRole: lineage?.materialRole ?? 'unclassified',
      materialLineageKey,
      accent: lineage?.accent ?? materialTraceAccent(materialLineageKey)
    }]
  })
}

/**
 * 把标准转运节点关联到进入该节点的物料谱系；每个转运节点只承载首个稳定输入谱系。
 */
function workflowMaterialLineageByNode(
  graph: WorkflowAuthoringGraph
): Map<string, WorkflowMaterialLineage> {
  const structure = projectPersistentAuthoringGraph(graph)
  const projection = projectMaterialTraces(structure.nodes, structure.links)
  const lineageByKey = new Map(
    projection.lineages.map((lineage) => [lineage.key, lineage])
  )
  const lineageByNode = new Map<string, WorkflowMaterialLineage>()
  structure.links.forEach((link, index) => {
    const lineageKey = projection.edgeLineages.get(index)
    const lineage = lineageKey ? lineageByKey.get(lineageKey) : undefined
    if (lineage && !lineageByNode.has(link.target)) {
      lineageByNode.set(link.target, lineage)
    }
  })
  return lineageByNode
}

/**
 * 选择与权威运行态一致的工作流（Workflow）图并生成物料转运路线。
 *
 * @param appliedGraph 当前已应用编写图，只提供尚无任务时的规划路线。
 * @param task 最新工作流任务（WorkflowTask）的稳定身份与冻结快照。
 * @param jobs 只属于该任务快照的工作流节点作业（WorkflowNodeJob）。
 * @returns 从任务冻结快照投影的运行态路线；快照无法验证时返回当前图规划态。
 */
export function projectWorkflowMaterialTransferProjection(
  appliedGraph: WorkflowAuthoringGraph,
  task: Pick<WorkflowTask, 'workflow_uuid' | 'workflow_snapshot'> | null,
  jobs: readonly WorkflowNodeJob[] = []
): WorkflowMaterialTransferRoute[] {
  const appliedWorkflowUuid = stringValue(appliedGraph.workflow.uuid)
  const snapshot = task &&
    task.workflow_uuid === appliedWorkflowUuid &&
    isWorkflowAuthoringGraph(task.workflow_snapshot) &&
    stringValue(task.workflow_snapshot.workflow.uuid) === task.workflow_uuid &&
    sameWorkflowRevision(appliedGraph, task.workflow_snapshot)
    ? task.workflow_snapshot
    : null
  return snapshot
    ? projectWorkflowMaterialTransferRoutes(snapshot, jobs)
    : projectWorkflowMaterialTransferRoutes(appliedGraph)
}

/**
 * 只有任务冻结图与当前已应用模板属于同一修订时，才允许历史作业状态装饰路线。
 * 两端都没有修订字段时保留旧后端兼容；只要一端声明修订就要求严格相等。
 */
function sameWorkflowRevision(
  appliedGraph: WorkflowAuthoringGraph,
  snapshot: WorkflowAuthoringGraph
): boolean {
  const appliedRevision = workflowRevision(appliedGraph)
  const snapshotRevision = workflowRevision(snapshot)
  if (appliedRevision === null && snapshotRevision === null) return true
  return appliedRevision !== null && appliedRevision === snapshotRevision
}

function workflowRevision(graph: WorkflowAuthoringGraph): string | null {
  const value = graph.workflow.revision
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return optionalString(value)
}

/**
 * 聚合一个标准物料转运节点下的权威工作流节点作业（WorkflowNodeJob）状态。
 *
 * @param jobs 同一转运复合节点及其子节点的作业状态集合。
 * @returns 只读路线状态；跳过不构成成功，取消请求与确认取消保持分离。
 */
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
  if (statuses.has('cancel_requested')) return 'canceling'
  if (
    statuses.has('running') ||
    statuses.has('dispatched')
  ) return 'running'
  if (statuses.has('canceled')) return 'canceled'
  if ([...statuses].every(isSuccessfulStatus)) return 'succeeded'
  return 'pending'
}

/** 仅把权威 `succeeded` 识别为已完成；`skipped` 不能伪装为物料转运成功。 */
function isSuccessfulStatus(status: WorkflowNodeJobStatus): boolean {
  return status === 'succeeded'
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
    if (transferNodeKind(current, templateByUuid)) return currentUuid
    const parentUuid = optionalString(current.parent_uuid)
    if (!parentUuid) return null
    current = nodeByUuid.get(parentUuid)
  }
  return null
}

type TransferNodeKind = 'standard' | 'host-resource'

function transferNodeKind(
  node: Record<string, unknown>,
  templateByUuid: ReadonlyMap<string, Record<string, unknown>>
): TransferNodeKind | null {
  const template = templateByUuid.get(
    stringValue(node.workflow_node_template_uuid)
  )
  // Workspace authoring graphs publish the source identity on the template,
  // while Backend release graphs preserve it on the concrete composite node.
  // Both are authoritative publication boundaries and must project identically.
  const nodeSource = recordValue(
    recordValue(recordValue(node.meta_data).unilab).workflow_source
  )
  const templateSource = recordValue(
    recordValue(recordValue(template?.meta_data).unilab).workflow_source
  )
  if (workflowNodeVisualKind({
    symbol:
      optionalString(nodeSource.symbol) ??
      optionalString(templateSource.symbol),
    definitionFqid:
      optionalString(nodeSource.definition_fqid) ??
      optionalString(templateSource.definition_fqid)
  }) === 'robot-transfer') return 'standard'

  const metaData = recordValue(template?.meta_data)
  const unilab = recordValue(metaData.unilab)
  const resourceTemplate = recordValue(unilab.resource_template)
  const templateClass = optionalString(template?.class)
  const isHostTemplate = optionalString(resourceTemplate.name) === 'host_node' ||
    templateClass === 'unilabos.ros.nodes.presets.host_node:HostNode'
  return isHostTemplate &&
    optionalString(template?.name) === 'transfer_resource' &&
    optionalString(node.action_name) === 'transfer_resource'
    ? 'host-resource'
    : null
}

function materialPredecessorsByNode(
  graph: WorkflowAuthoringGraph
): ReadonlyMap<string, readonly string[]> {
  const handleByUuid = new Map(
    graph.handle_templates.map((handle) => [stringValue(handle.uuid), handle])
  )
  const predecessors = new Map<string, string[]>()
  for (const edge of graph.edges) {
    const sourceHandle = handleByUuid.get(stringValue(edge.source_handle_uuid))
    const targetHandle = handleByUuid.get(stringValue(edge.target_handle_uuid))
    if (
      optionalString(sourceHandle?.type) !== 'ResourceSlot' ||
      optionalString(targetHandle?.type) !== 'ResourceSlot'
    ) continue
    const sourceNodeUuid = stringValue(edge.source_node_uuid)
    const targetNodeUuid = stringValue(edge.target_node_uuid)
    if (!sourceNodeUuid || !targetNodeUuid) continue
    const incoming = predecessors.get(targetNodeUuid) ?? []
    if (!incoming.includes(sourceNodeUuid)) incoming.push(sourceNodeUuid)
    predecessors.set(targetNodeUuid, incoming)
  }
  return predecessors
}

function upstreamMaterialLocation(
  workflowNodeUuid: string,
  nodeByUuid: ReadonlyMap<string, Record<string, unknown>>,
  templateByUuid: ReadonlyMap<string, Record<string, unknown>>,
  predecessors: ReadonlyMap<string, readonly string[]>
): WorkflowMaterialTransferEndpoint | null {
  const queue = [...(predecessors.get(workflowNodeUuid) ?? [])]
  const visited = new Set<string>([workflowNodeUuid])
  while (queue.length > 0) {
    const candidateUuid = queue.shift()
    if (!candidateUuid || visited.has(candidateUuid)) continue
    visited.add(candidateUuid)
    const candidate = nodeByUuid.get(candidateUuid)
    if (!candidate) continue
    const location = materialLocationAfterNode(candidate, templateByUuid)
    if (location) return location
    queue.push(...(predecessors.get(candidateUuid) ?? []))
  }
  return null
}

function materialLocationAfterNode(
  node: Record<string, unknown>,
  templateByUuid: ReadonlyMap<string, Record<string, unknown>>
): WorkflowMaterialTransferEndpoint | null {
  const param = recordValue(node.param)
  if (
    optionalString(node.type) === 'material_source' ||
    optionalString(node.action_name) === 'material_source'
  ) {
    const ownerMaterialId = resourceIdentity(param.mount)
    return ownerMaterialId
      ? { ownerMaterialId, siteKey: optionalString(param.site) }
      : null
  }
  const kind = transferNodeKind(node, templateByUuid)
  if (!kind) return null
  const ownerMaterialId = kind === 'standard'
    ? resourceIdentity(param.target_warehouse)
    : resourceIdentity(param.mount_resource)
  const siteKey = kind === 'standard'
    ? optionalString(param.target_site)
    : optionalString(param.site)
  return ownerMaterialId ? { ownerMaterialId, siteKey } : null
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

/**
 * 判断工作流任务（WorkflowTask）冻结快照是否具有可投影的编写图结构。
 *
 * @param value 未信任的任务快照 DTO。
 * @returns 仅当工作流身份及四个图集合存在时返回真；不修补缺失字段。
 */
function isWorkflowAuthoringGraph(value: unknown): value is WorkflowAuthoringGraph {
  const graph = recordValue(value)
  return Boolean(optionalString(recordValue(graph.workflow).uuid)) &&
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    Array.isArray(graph.node_templates) &&
    Array.isArray(graph.handle_templates)
}
