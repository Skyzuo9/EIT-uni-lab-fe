import type { HttpClient } from './http'
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
  signal?: AbortSignal
): Promise<WorkflowExecutableCatalogSnapshot> {
  // `defaultCatalog` 只请求 Backend 默认可见动作类型，不能混入物料来源。
  const defaultCatalog = await loadWorkflowNodeTemplateCatalog(http, { signal })
  // `workflowCatalog` 显式请求已发布工作流，避免依赖服务端默认类型集合。
  const workflowCatalog = await loadWorkflowNodeTemplateCatalog(http, {
    nodeType: 'workflow',
    signal
  })
  const catalog = mergeWorkflowNodeTemplateCatalogs(
    defaultCatalog,
    workflowCatalog
  )
  type SummaryValue = {
    uuid: string
    name: string
    displayName: string
    actionType: string
    nodeType: string
    resourceTemplateUuid: string
  }

  /**
   * 校验节点模板列表摘要的可执行投影字段。
   *
   * @param summary 未信任的 Backend 列表摘要。
   * @returns 稳定 UUID、展示字段、节点类型与资源模板身份。
   * @throws 任一字段缺失或 UUID 无效时关闭失败。
   */
  function projectSummaryValue(
    summary: Record<string, unknown>
  ): SummaryValue {
    const uuid = uuidValue(summary.uuid)
    const resource = recordValue(summary.resource_template)
    return {
      uuid,
      name: stringValue(summary.name),
      displayName: stringValue(summary.display_name),
      actionType: stringValue(summary.type),
      nodeType: stringValue(summary.node_type),
      resourceTemplateUuid: uuidValue(resource.uuid)
    }
  }

  /**
   * 把一个列表摘要核对并投影成动作或已发布工作流模板。
   *
   * @param summary 已校验稳定身份和展示字段的列表摘要。
   * @param data 已核对目录代际的节点模板详情主体。
   * @returns 可执行模板；非可执行框架节点返回 null。
   * @throws 详情与摘要、目录代际或类型合同不一致时关闭失败。
   */
  function projectSummary(
    summary: SummaryValue,
    data: Record<string, unknown>
  ):
    WorkflowActionNodeTemplate | WorkflowPublishedNodeTemplate | null
  {
    const template = recordValue(data.template)
    const uuid = uuidValue(template.uuid)
    const resourceTemplateUuid = uuidValue(template.resource_template_uuid)
    if (
      uuid !== summary.uuid ||
      resourceTemplateUuid !== summary.resourceTemplateUuid ||
      stringValue(template.name) !== summary.name ||
      stringValue(template.display_name) !== summary.displayName ||
      stringValue(template.type) !== summary.actionType ||
      stringValue(template.node_type) !== summary.nodeType
    ) {
      invalidCatalog()
    }
    const rawSchema = templateSchemaValue(template.schema)
    const actionSchema = typedActionSchema(rawSchema) ??
      persistedActionContractSchema(template)
    const workflowSchema = typedWorkflowSchema(rawSchema)
    if (actionSchema && workflowSchema) invalidCatalog()
    if (workflowSchema) {
      return projectPublishedWorkflow(
        template,
        recordArray(data.handles),
        summary,
        workflowSchema
      )
    }
    if (!actionSchema) return null
    return attachWireValue({
      uuid,
      resourceTemplateUuid,
      name: summary.name,
      displayName: summary.displayName,
      actionClass: nullableString(template.class),
      actionType: summary.actionType,
      schema: actionSchema,
      goal: recordValue(template.goal),
      goalDefault: recordValue(template.goal_default),
      handles: projectHandles(recordArray(data.handles), uuid)
    }, template)
  }

  const projected: Array<
    WorkflowActionNodeTemplate | WorkflowPublishedNodeTemplate | null
  > = []
  const details = await loadWorkflowNodeTemplateDetails(http, catalog, signal)
  for (const entry of details) {
    projected.push(projectSummary(
      projectSummaryValue(entry.summary),
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

/**
 * 把原始句柄数组投影为一个节点模板的句柄集合。
 *
 * @param handles 原始详情句柄数组。
 * @param parentUuid 所有句柄必须引用的节点模板 UUID。
 * @returns 保持服务端顺序的已校验句柄。
 * @throws 任一句柄身份或元数据无效时关闭失败。
 */
function projectHandles(
  handles: Record<string, unknown>[],
  parentUuid: string
): WorkflowActionHandleTemplate[] {
  const projected: WorkflowActionHandleTemplate[] = []
  for (const handle of handles) projected.push(projectHandle(handle, parentUuid))
  return projected
}

interface WorkflowSchemaProjection {
  schema: Record<string, unknown>
  workflowUuid: string
  workflowRevision: number
  appliedSourceHash: string
  contractDigest: string
  compositionAllowTransparent: boolean
  inputOrder: string[]
  outputOrder: string[]
  inputSchemas: Record<string, Record<string, unknown>>
  outputSchemas: Record<string, Record<string, unknown>>
  requiredInputs: Set<string>
}

/** 投影已发布工作流（PublishedWorkflow）；参数是详情、句柄、摘要与冻结合同，返回边界模板，任一对应关系非法时关闭失败。 */
function projectPublishedWorkflow(
  template: Record<string, unknown>,
  rawHandles: Record<string, unknown>[],
  summary: {
    uuid: string
    name: string
    displayName: string
    actionType: string
    nodeType: string
    resourceTemplateUuid: string
  },
  contract: WorkflowSchemaProjection
): WorkflowPublishedNodeTemplate {
  if (
    summary.actionType !== 'workflow' ||
    summary.nodeType !== 'workflow' ||
    summary.name !== `workflow:${contract.workflowUuid}`
  ) invalidCatalog()
  const unilab = closedRecord(
    recordValue(template.meta_data).unilab,
    ['framework_owner_only', 'workflow_source']
  )
  if (unilab.framework_owner_only !== true) invalidCatalog()
  const rawSource = closedRecord(unilab.workflow_source, [
    'kind',
    'definition_fqid',
    'module',
    'symbol',
    'package_catalog_digest',
    'definition_content_hash'
  ])
  const module = absoluteModule(rawSource.module)
  const symbol = identifierValue(rawSource.symbol)
  const workflowClass = stringValue(template.class)
  if (workflowClass !== `${module}:${symbol}` || rawSource.kind !== 'package') {
    invalidCatalog()
  }
  const source: WorkflowPublishedSource = {
    kind: 'package',
    definitionFqid: stringValue(rawSource.definition_fqid),
    module,
    symbol,
    packageCatalogDigest: digestValue(rawSource.package_catalog_digest),
    definitionContentHash: digestValue(rawSource.definition_content_hash)
  }
  const handles = orderPublishedHandles(
    rawHandles.map((handle) => projectHandle(handle, summary.uuid)),
    contract
  )
  validatePublishedHandles(handles, contract)
  const goal = recordValue(template.goal)
  const goalDefault = recordValue(template.goal_default)
  const result = recordValue(template.result)
  if (
    !stringMapMatches(goal, contract.inputOrder) ||
    !stringMapMatches(result, contract.outputOrder) ||
    !defaultsMatch(goalDefault, contract)
  ) invalidCatalog()
  return attachWireValue({
    uuid: summary.uuid,
    resourceTemplateUuid: summary.resourceTemplateUuid,
    name: summary.name,
    displayName: summary.displayName,
    workflowClass,
    workflowUuid: contract.workflowUuid,
    workflowRevision: contract.workflowRevision,
    appliedSourceHash: contract.appliedSourceHash,
    contractDigest: contract.contractDigest,
    compositionAllowTransparent: contract.compositionAllowTransparent,
    inputOrder: contract.inputOrder,
    outputOrder: contract.outputOrder,
    schema: contract.schema,
    goal,
    goalDefault,
    result,
    source,
    handles
  }, template)
}

/** 规范已发布工作流连接点顺序；参数是连接点与冻结合同，返回业务输入/输出后接 ready 的序列，缺失或重复时关闭失败。 */
function orderPublishedHandles(
  handles: WorkflowActionHandleTemplate[],
  contract: WorkflowSchemaProjection
): WorkflowActionHandleTemplate[] {
  const unique = (
    handleKey: string,
    ioType: 'source' | 'target'
  ): WorkflowActionHandleTemplate => {
    const matches = handles.filter((handle) =>
      handle.handleKey === handleKey && handle.ioType === ioType
    )
    if (matches.length !== 1) invalidCatalog()
    return matches[0] as WorkflowActionHandleTemplate
  }
  const ordered = [
    ...contract.inputOrder.map((name) => unique(name, 'target')),
    ...contract.outputOrder.map((name) => unique(name, 'source')),
    unique('ready', 'target'),
    unique('ready', 'source')
  ]
  if (
    ordered.length !== handles.length ||
    new Set(ordered.map((handle) => handle.uuid)).size !== handles.length
  ) invalidCatalog()
  return ordered
}

/** 投影单个连接点；参数是 wire 对象与父模板 UUID，返回编辑器连接点，身份、方向或元数据非法时关闭失败。 */
function projectHandle(
  raw: Record<string, unknown>,
  parentUuid: string
): WorkflowActionHandleTemplate {
  const uuid = uuidValue(raw.uuid)
  const workflowNodeTemplateUuid = uuidValue(
    raw.workflow_node_template_uuid
  )
  if (workflowNodeTemplateUuid !== parentUuid) invalidCatalog()
  const ioType = stringValue(raw.io_type)
  if (ioType !== 'source' && ioType !== 'target') invalidCatalog()
  if (typeof raw.required !== 'boolean') invalidCatalog()
  const handleKey = stringValue(raw.handle_key)
  const valueType = stringValue(raw.type)
  const dataSource = nullableString(raw.data_source)
  const dataKey = nullableString(raw.data_key)
  const metaData = recordValue(raw.meta_data)
  if (
    handleKey === 'ready' &&
    valueType === 'default' &&
    raw.required === false &&
    dataSource === null &&
    dataKey === null &&
    Object.keys(metaData).length === 0
  ) {
    return attachWireValue({
      uuid,
      workflowNodeTemplateUuid,
      handleKey,
      ioType,
      displayName: stringValue(raw.display_name),
      valueType,
      required: false,
      dataSource: null,
      dataKey: null,
      valueSchema: {},
      editorControl: 'variable_selector',
      allowedResourceTemplateUuids: null,
      implicitPassthrough: false,
      structuralRole: 'ready'
    }, raw)
  }
  const unilab = recordValue(metaData.unilab)
  const control = stringValue(unilab.editor_control)
  if (
    control !== 'material_port' &&
    control !== 'site_selector' &&
    control !== 'variable_selector'
  ) {
    invalidCatalog()
  }
  const allowlist = allowlistValue(unilab.allowed_resource_template_uuids)
  return attachWireValue({
    uuid,
    workflowNodeTemplateUuid,
    handleKey,
    ioType,
    displayName: stringValue(raw.display_name),
    valueType,
    required: raw.required,
    dataSource,
    dataKey,
    valueSchema: recordValue(unilab.value_schema),
    editorControl: control,
    allowedResourceTemplateUuids: allowlist,
    implicitPassthrough: booleanValue(unilab.implicit_passthrough),
    structuralRole: structuralRoleValue(unilab.structural_role)
  }, raw)
}

/** 保存不可枚举 wire 值；参数是投影对象和原始记录，返回同对象的只读 wire 增强，不主动抛错。 */
function attachWireValue<T extends object>(
  value: T,
  wireValue: Record<string, unknown>
): T & { wireValue: Record<string, unknown> } {
  Object.defineProperty(value, 'wireValue', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { ...wireValue }
  })
  return value as T & { wireValue: Record<string, unknown> }
}

/** 解析动作合同；参数是原始 schema，返回合法动作 schema 或 null，显式扩展非法时关闭失败。 */
function typedActionSchema(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const schema = raw as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(
    schema,
    'x-unilabos-action-contract'
  )) return null
  const extension = recordValue(schema['x-unilabos-action-contract'])
  if (extension.version !== 1 && extension.version !== 2) invalidCatalog()
  const inputOrder = stringArray(extension.input_order)
  const outputOrder = stringArray(extension.output_order)
  if (
    new Set(inputOrder).size !== inputOrder.length ||
    new Set(outputOrder).size !== outputOrder.length
  ) {
    invalidCatalog()
  }
  return schema
}

/**
 * 从数据库节点模板保留元数据读取第 2 版动作合同（Action Contract）。
 *
 * @param template 未信任的节点模板详情。
 * @returns 合法动作合同；没有保留合同的框架或旧模板返回 null。
 * @throws 显式保留合同存在但形状、版本或顺序非法时关闭失败。
 */
function persistedActionContractSchema(
  template: Record<string, unknown>
): Record<string, unknown> | null {
  const metaData = template.meta_data
  if (!metaData || typeof metaData !== 'object' || Array.isArray(metaData)) {
    return null
  }
  const unilab = (metaData as Record<string, unknown>).unilab
  if (!unilab || typeof unilab !== 'object' || Array.isArray(unilab)) {
    return null
  }
  const contract = (unilab as Record<string, unknown>).action_contract_schema
  if (contract === undefined || contract === null) return null
  const parsed = typedActionSchema(templateSchemaValue(contract))
  if (!parsed) invalidCatalog()
  return parsed
}

/** 解析已发布工作流合同；参数是原始 schema，返回冻结合同投影或 null，闭合结构非法时关闭失败。 */
function typedWorkflowSchema(raw: unknown): WorkflowSchemaProjection | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const schema = raw as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(
    schema,
    'x-unilabos-workflow-contract'
  )) return null
  requireKeys(schema, [
    'type',
    'additionalProperties',
    'properties',
    'required',
    'x-unilabos-workflow-contract'
  ])
  if (schema.type !== 'object' || schema.additionalProperties !== false) {
    invalidCatalog()
  }
  const properties = closedRecord(schema.properties, ['goal', 'result'])
  const required = stringArray(schema.required)
  if (!sameStringSet(required, ['goal', 'result'])) invalidCatalog()
  const goal = objectEnvelope(properties.goal)
  const result = objectEnvelope(properties.result)
  const extension = closedRecord(schema['x-unilabos-workflow-contract'], [
    'version',
    'compatibility_version',
    'workflow_uuid',
    'workflow_revision',
    'applied_source_hash',
    'contract_digest',
    'composition_allow_transparent',
    'input_order',
    'output_order'
  ])
  if (extension.version !== 1 || extension.compatibility_version !== 1) {
    invalidCatalog()
  }
  const inputOrder = uniqueStringArray(extension.input_order)
  const outputOrder = uniqueStringArray(extension.output_order)
  if (
    !sameStringSet(inputOrder, Object.keys(goal.properties)) ||
    !sameStringSet(outputOrder, Object.keys(result.properties))
  ) invalidCatalog()
  return {
    schema,
    workflowUuid: uuidValue(extension.workflow_uuid),
    workflowRevision: positiveInteger(extension.workflow_revision),
    appliedSourceHash: digestValue(extension.applied_source_hash),
    contractDigest: digestValue(extension.contract_digest),
    compositionAllowTransparent: booleanValue(
      extension.composition_allow_transparent
    ),
    inputOrder,
    outputOrder,
    inputSchemas: goal.properties,
    outputSchemas: result.properties,
    requiredInputs: new Set(goal.required)
  }
}

/** 解析 goal/result 对象 envelope；参数是原始值，返回属性 schema 与必填键，开放或不一致结构时关闭失败。 */
function objectEnvelope(raw: unknown): {
  properties: Record<string, Record<string, unknown>>
  required: string[]
} {
  const value = closedRecord(raw, [
    'type',
    'additionalProperties',
    'properties',
    'required'
  ])
  if (value.type !== 'object' || value.additionalProperties !== false) {
    invalidCatalog()
  }
  const properties = recordValue(value.properties)
  const normalized: Record<string, Record<string, unknown>> = {}
  for (const [name, property] of Object.entries(properties)) {
    if (!name) invalidCatalog()
    normalized[name] = recordValue(property)
  }
  const required = uniqueStringArray(value.required)
  if (required.some((name) => !(name in normalized))) invalidCatalog()
  return { properties: normalized, required }
}

/** 验证全部已发布工作流连接点；参数是连接点与冻结合同，无返回值，数量、方向或 schema 不一致时关闭失败。 */
function validatePublishedHandles(
  handles: WorkflowActionHandleTemplate[],
  contract: WorkflowSchemaProjection
): void {
  if (handles.length !== contract.inputOrder.length +
    contract.outputOrder.length + 2) invalidCatalog()
  let index = 0
  for (const name of contract.inputOrder) {
    const handle = handles[index++]
    if (!handle) invalidCatalog()
    validateBusinessHandle(
      handle,
      name,
      'target',
      'goal',
      contract.inputSchemas[name],
      contract.requiredInputs.has(name)
    )
  }
  for (const name of contract.outputOrder) {
    const handle = handles[index++]
    if (!handle) invalidCatalog()
    validateBusinessHandle(
      handle,
      name,
      'source',
      'result',
      contract.outputSchemas[name],
      false
    )
  }
  validateReadyHandle(handles[index++], 'target')
  validateReadyHandle(handles[index], 'source')
}

/** 验证业务连接点；参数包含连接点、名称、方向、数据源、schema 与必填性，无返回值，不一致时关闭失败。 */
function validateBusinessHandle(
  handle: WorkflowActionHandleTemplate,
  name: string,
  ioType: 'source' | 'target',
  dataSource: 'goal' | 'result',
  schema: Record<string, unknown> | undefined,
  required: boolean
): void {
  if (
    !schema ||
    handle.handleKey !== name ||
    handle.ioType !== ioType ||
    handle.dataSource !== dataSource ||
    handle.dataKey !== name ||
    handle.required !== required ||
    handle.structuralRole !== null ||
    handle.valueType !== workflowValueType(schema) ||
    handle.editorControl !== (
      resourceSlotSchema(schema) ? 'material_port' : 'variable_selector'
    ) ||
    !jsonEquals(handle.valueSchema, handleValueSchema(schema)) ||
    !sameAllowlist(handle.allowedResourceTemplateUuids, schemaAllowlist(schema))
  ) invalidCatalog()
}

/** 取得连接点值 schema；参数是冻结属性 schema，返回移除 default 的副本，不主动抛错。 */
function handleValueSchema(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const value = { ...schema }
  delete value.default
  return value
}

/** 验证 ready 结构连接点；参数是可选连接点与方向，无返回值，结构语义不精确时关闭失败。 */
function validateReadyHandle(
  handle: WorkflowActionHandleTemplate | undefined,
  ioType: 'source' | 'target'
): void {
  const common = Boolean(
    handle &&
    handle.handleKey === 'ready' &&
    handle.ioType === ioType &&
    !handle.required &&
    handle.editorControl === 'variable_selector' &&
    handle.allowedResourceTemplateUuids === null &&
    !handle.implicitPassthrough &&
    handle.structuralRole === 'ready'
  )
  const legacy = Boolean(
    handle &&
    handle.dataSource === 'dependency' &&
    handle.dataKey === 'ready' &&
    handle.valueType === 'boolean' &&
    jsonEquals(handle.valueSchema, { type: 'boolean' })
  )
  const canonical = Boolean(
    handle &&
    handle.dataSource === null &&
    handle.dataKey === null &&
    handle.valueType === 'default' &&
    jsonEquals(handle.valueSchema, {})
  )
  if (!common || (!legacy && !canonical)) invalidCatalog()
}

/** 解析物料占位符（ResourceSlot）资源模板白名单；参数是属性 schema，返回 UUID 数组或 null，非法时关闭失败。 */
function schemaAllowlist(schema: Record<string, unknown>): string[] | null {
  const slot = resourceSlotSchema(schema)
  if (slot) {
    const raw = slot.allowed_resource_template_uuids
    return raw === undefined ? null : allowlistValue(raw)
  }
  return null
}

/** 定位嵌套物料占位符（ResourceSlot）schema；参数是属性 schema，返回命中对象或 null，不主动抛错。 */
function resourceSlotSchema(
  schema: Record<string, unknown>
): Record<string, unknown> | null {
  if (schema.$slot === 'ResourceSlot') return schema
  if (schema.items && typeof schema.items === 'object' &&
    !Array.isArray(schema.items)) {
    const nested = resourceSlotSchema(schema.items as Record<string, unknown>)
    if (nested) return nested
  }
  if (Array.isArray(schema.anyOf)) {
    for (const member of schema.anyOf) {
      if (member && typeof member === 'object' && !Array.isArray(member)) {
        const nested = resourceSlotSchema(member as Record<string, unknown>)
        if (nested) return nested
      }
    }
  }
  return null
}

/** 推导工作流值类型；参数是冻结属性 schema，返回 wire type，缺失基础类型时关闭失败。 */
function workflowValueType(schema: Record<string, unknown>): string {
  const members = Array.isArray(schema.anyOf) ? schema.anyOf : []
  const base = members.find((member) =>
    member && typeof member === 'object' && !Array.isArray(member) &&
    (member as Record<string, unknown>).type !== 'null'
  ) as Record<string, unknown> | undefined ?? schema
  if (base.type === 'array') return 'array'
  if (resourceSlotSchema(base)) return 'ResourceSlot'
  return typeof base.type === 'string' ? base.type : 'object'
}

/** 比较两个白名单；参数是可空 UUID 数组，返回顺序与内容完全一致性，不主动抛错。 */
function sameAllowlist(left: string[] | null, right: string[] | null): boolean {
  return left === null
    ? right === null
    : right !== null && sameStrings(left, right)
}

/** 核对字符串映射键；参数是映射与期望顺序，返回键集合一致性，映射无效时关闭失败。 */
function stringMapMatches(
  raw: Record<string, unknown>,
  order: string[]
): boolean {
  return sameStringSet(Object.keys(raw), order) &&
    order.every((name) => raw[name] === name)
}

/** 核对默认值；参数是默认值映射与冻结合同，返回默认值合法性，结构无效时关闭失败。 */
function defaultsMatch(
  defaults: Record<string, unknown>,
  contract: WorkflowSchemaProjection
): boolean {
  const expected = contract.inputOrder.filter((name) =>
    Object.prototype.hasOwnProperty.call(contract.inputSchemas[name], 'default')
  )
  return sameStringSet(Object.keys(defaults), expected) && expected.every((name) =>
    jsonEquals(defaults[name], contract.inputSchemas[name]?.default)
  )
}
