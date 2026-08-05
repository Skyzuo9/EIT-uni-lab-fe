const WORKFLOW_NODE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * 构造唯一命中 React Flow 画布工作流节点（WorkflowNode）的精确选择器。
 *
 * 参数：`workflowNodeUuid` 是服务端工作流图提供的稳定节点 UUID。
 * 返回：复用生产画布 `.react-flow__node[data-id]` 身份接缝的 CSS 选择器。
 * 异常：空值、非规范小写 UUID 或可能改变 CSS 语义的输入抛出 `Error`；不得
 * 回退为 `.first()`、`.nth()`、文本或内部 `data-workflow-node-uuid`。
 */
export function canvasWorkflowNodeSelector(workflowNodeUuid: string): string {
  if (!WORKFLOW_NODE_UUID_PATTERN.test(workflowNodeUuid)) {
    throw new Error("工作流节点 UUID 必须是规范小写 UUID");
  }
  return `.react-flow__node[data-id="${workflowNodeUuid}"]`;
}
