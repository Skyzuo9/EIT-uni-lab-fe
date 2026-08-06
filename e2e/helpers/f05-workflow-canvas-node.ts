import { expect, type Locator } from "@playwright/test";

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

/**
 * 在已进入画布模式后选择精确身份且可见的工作流节点（WorkflowNode）。
 *
 * 参数：`panel` 是当前工作流创作面板，`workflowNodeUuid` 是外层 React Flow
 * （流程画布引擎）节点的稳定 UUID。
 * 返回：节点通过真实指针点击完成选择后结束。
 * 异常：画布模式未激活、节点不可见、身份非法或普通点击失败时传播 Playwright 错误；
 * 不使用强制点击、顺序定位或 DOM 事件绕过用户路径。
 */
export async function clickVisibleCanvasWorkflowNode(
  panel: Locator,
  workflowNodeUuid: string,
): Promise<void> {
  // `canvasModeButton` 是必须已经进入按下状态的画布模式入口。
  const canvasModeButton = panel.getByRole("button", {
    name: "画布模式",
    exact: true,
  });
  await expect(canvasModeButton).toHaveAttribute("aria-pressed", "true");

  // `canvasNode` 是以外层稳定 UUID 精确定位的可见工作流节点（WorkflowNode）。
  const canvasNode = panel.locator(canvasWorkflowNodeSelector(workflowNodeUuid));
  await expect(canvasNode).toBeVisible();
  await canvasNode.click({ position: { x: 42, y: 42 } });
}
