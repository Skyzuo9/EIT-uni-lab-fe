/**
 * 类型化工作流操作目录的稳定公共接口。
 *
 * 具体实现按节点创建、字段编辑和权威目录复水分为三个深模块
 * （Deep Module）；调用方继续从本文件导入，不感知内部文件组织。
 */
export {
  bindTypedActionWorkflowInput,
  connectFrameworkSourceToTypedActionEdge,
  connectTypedActionEdge,
  projectTypedActionEditor,
  updateTypedActionLiteral,
  type TypedActionEditorProjection,
  type TypedActionFieldDiagnostic,
  type TypedActionFieldProjection
} from './workflowActionCatalogEditor'
export {
  createPublishedWorkflowNode,
  createTypedActionNode
} from './workflowActionCatalogNodes'
export { rehydrateTypedActionGraph } from './workflowActionCatalogRehydrate'
