import { expect, test } from "@playwright/test";

import { canvasWorkflowNodeSelector } from "./f05-workflow-canvas-node";

test("画布工作流节点选择器复用 React Flow 稳定身份", selectsCanvasNode);
test("画布工作流节点选择器拒绝不可信身份", rejectsUnsafeIdentity);

/**
 * 证明选择器只命中带精确 `data-id` 的 React Flow 工作流节点（WorkflowNode）。
 *
 * 参数：无。返回：无。断言：固定 UUID 生成生产代码已使用的 class + 身份属性。
 * 异常：选择器退化为内部节点属性、文本或顺序定位时断言失败。
 */
function selectsCanvasNode(): void {
  // ``workflowNodeUuid`` 是画布工作流节点（WorkflowNode）的稳定身份。
  const workflowNodeUuid = "66000000-0000-4000-8000-0000000002b0";
  expect(canvasWorkflowNodeSelector(workflowNodeUuid)).toBe(
    '.react-flow__node[data-id="66000000-0000-4000-8000-0000000002b0"]',
  );
}

/**
 * 证明空白、短 UUID 和 CSS 注入内容不能进入精确画布选择器。
 *
 * 参数：无。返回：无。断言：每个不可信身份都抛出稳定中文错误。
 * 异常：任何输入被裁剪、猜测或直接拼接时断言失败。
 */
function rejectsUnsafeIdentity(): void {
  // ``unsafeIdentities`` 是不得进入 CSS 属性选择器的全部测试输入。
  const unsafeIdentities = [
    "",
    " ",
    "66000000",
    '66000000-0000-4000-8000-0000000002b0"] option',
  ];
  for (const unsafeIdentity of unsafeIdentities) {
    /**
     * 尝试把当前不可信身份转换为画布节点选择器。
     *
     * @returns 仅在安全门错误接受输入时返回选择器。
     * @throws 预期抛出工作流节点 UUID 校验错误。
     */
    function selectUnsafeIdentity(): string {
      return canvasWorkflowNodeSelector(unsafeIdentity);
    }
    expect(selectUnsafeIdentity).toThrow(
      /工作流节点 UUID/,
    );
  }
}
