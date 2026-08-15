import type { HttpClient } from './http'
import {
  projectWorkflowExecutableTemplate,
  projectWorkflowSummaryValue
} from './workflowActionCatalogProjection'
import {
  loadWorkflowNodeTemplateCatalog,
  loadWorkflowNodeTemplateDetails,
  mergeWorkflowNodeTemplateCatalogs,
} from './workflowNodeTemplateCursor'
import type {
  WorkflowActionEditorControl,
  WorkflowActionHandleTemplate,
  WorkflowActionNodeTemplate,
  WorkflowExecutableCatalogSnapshot,
  WorkflowPublishedNodeTemplate,
  WorkflowPublishedSource
} from './workflowActionCatalogTypes'
import {
  absoluteModule,
  allowlistValue,
  booleanValue,
  closedRecord,
  digestValue,
  identifierValue,
  invalidCatalog,
  jsonEquals,
  nullableString,
  positiveInteger,
  recordArray,
  recordValue,
  requireKeys,
  sameStringSet,
  sameStrings,
  stringArray,
  stringValue,
  structuralRoleValue,
  templateSchemaValue,
  uniqueStringArray,
  uuidValue
} from './workflowActionCatalogWire'

export type {
  WorkflowActionEditorControl,
  WorkflowActionHandleTemplate,
  WorkflowActionNodeTemplate,
  WorkflowExecutableCatalogSnapshot,
  WorkflowPublishedNodeTemplate,
  WorkflowPublishedSource,
  WorkflowActionCatalogSnapshot
} from './workflowActionCatalogTypes'

export interface WorkflowActionCatalogQuery {
  resourceTemplateUuid?: string
}

/**
 * 加载动作模板与已发布工作流（PublishedWorkflow）的统一可执行目录。
 *
 * @param http 节点模板列表与详情共用的 HTTP 客户端。
 * @param signal 调用方取消信号；传递到全部列表页和详情请求。
 * @returns Backend 默认动作目录和显式 workflow 目录的闭合投影。
 * @throws 摘要、详情、类型合同、UUID 或可选 OS 目录代际无效时关闭失败。
 */
export async function loadWorkflowActionCatalog(
  http: HttpClient,
  signal?: AbortSignal,
  query: WorkflowActionCatalogQuery = {}
): Promise<WorkflowExecutableCatalogSnapshot> {
  // `defaultCatalog` 只请求 Backend 默认可见动作类型，不能混入物料来源。
  const defaultCatalog = await loadWorkflowNodeTemplateCatalog(http, {
    resourceTemplateUuid: query.resourceTemplateUuid,
    signal
  })
  // `workflowCatalog` 显式请求已发布工作流，避免依赖服务端默认类型集合。
  const workflowCatalog = await loadWorkflowNodeTemplateCatalog(http, {
    nodeType: 'workflow',
    resourceTemplateUuid: query.resourceTemplateUuid,
    signal
  })
  const catalog = mergeWorkflowNodeTemplateCatalogs(
    defaultCatalog,
    workflowCatalog
  )
  const projected: Array<
    WorkflowActionNodeTemplate | WorkflowPublishedNodeTemplate | null
  > = []
  const details = await loadWorkflowNodeTemplateDetails(http, catalog, signal)
  for (const entry of details) {
    projected.push(projectWorkflowExecutableTemplate(
      projectWorkflowSummaryValue(entry.summary),
      entry.detail
    ))
  }
  const actionTemplates: WorkflowActionNodeTemplate[] = []
  const workflowTemplates: WorkflowPublishedNodeTemplate[] = []
  for (const value of projected) {
    if (value === null) continue
    if ('actionType' in value) actionTemplates.push(value)
    else workflowTemplates.push(value)
  }

  const handleUuids = new Set<string>()
  for (const detail of [...actionTemplates, ...workflowTemplates]) {
    for (const handle of detail.handles) {
      if (handleUuids.has(handle.uuid)) invalidCatalog()
      handleUuids.add(handle.uuid)
    }
  }
  return {
    ...(catalog.generation
      ? {
          authorityId: catalog.generation.authorityId,
          authorityKind: catalog.generation.authorityKind,
          fingerprint: catalog.generation.fingerprint
        }
      : {}),
    actionTemplates,
    workflowTemplates
  }
}
