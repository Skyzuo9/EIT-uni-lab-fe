import type { Node } from "reactflow";
import { describe, expect, it } from "vitest";

import { reconcileReactFlowNodeMeasurements } from "./reactFlowNodeMeasurement";

/**
 * 注册流程画布引擎（React Flow）节点测量保持测试。
 *
 * @returns 无。
 * @throws 测量断言失败时由 Vitest 报告。
 */
function registerReactFlowNodeMeasurementTests(): void {
  it("稳定节点身份继承当前有效测量", preservesCurrentMeasurement);
  it("下一版显式有效测量优先", prefersExplicitNextMeasurement);
  it("不同节点身份不串用测量", isolatesMeasurementsByNodeIdentity);
  it("没有有效测量时不伪造尺寸", doesNotFabricateMeasurement);
}

describe("流程画布引擎（React Flow）节点测量保持", registerReactFlowNodeMeasurementTests);

/**
 * 创建只包含本组断言所需字段的流程画布节点。
 *
 * 参数：`id` 是节点稳定身份，`measurement` 是可选顶层测量尺寸。
 * 返回：可交给测量协调函数的 React Flow（流程画布引擎）节点。
 * 异常：本测试助手不抛出异常；非法尺寸由各测试显式构造并验证。
 */
function flowNode(
  id: string,
  measurement: Partial<Pick<Node, "width" | "height">> = {},
): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    ...measurement,
  };
}

/**
 * 证明同一稳定节点身份在异步布局重建后继承已完成的有效测量。
 *
 * 参数：无。返回：无。断言：下一版节点保留当前正有限宽高。
 * 异常：节点重新变成未测量状态时断言失败。
 */
function preservesCurrentMeasurement(): void {
  // `currentNodes` 是 React Flow（流程画布引擎）已经测量完成的受控节点集合。
  const currentNodes = [flowNode("node-a", { width: 180, height: 96 })];
  // `nextNodes` 是目录或布局异步完成后重新生成、但尚未携带测量的节点集合。
  const nextNodes = [flowNode("node-a")];

  expect(reconcileReactFlowNodeMeasurements(currentNodes, nextNodes)[0]).toEqual(
    expect.objectContaining({ width: 180, height: 96 }),
  );
}

/**
 * 证明下一版节点已经提供有效测量时不会被旧测量覆盖。
 *
 * 参数：无。返回：无。断言：显式新宽高完整胜出。
 * 异常：协调函数错误恢复旧尺寸时断言失败。
 */
function prefersExplicitNextMeasurement(): void {
  // `currentNodes` 是仍带旧版视觉尺寸的当前节点集合。
  const currentNodes = [flowNode("node-a", { width: 180, height: 96 })];
  // `nextNodes` 是明确携带新版有效视觉尺寸的目标节点集合。
  const nextNodes = [flowNode("node-a", { width: 220, height: 112 })];

  expect(reconcileReactFlowNodeMeasurements(currentNodes, nextNodes)[0]).toEqual(
    expect.objectContaining({ width: 220, height: 112 }),
  );
}

/**
 * 证明测量只能按精确稳定身份继承，不能按数组顺序借给另一个节点。
 *
 * 参数：无。返回：无。断言：新身份仍没有宽高。
 * 异常：协调函数按位置迁移尺寸时断言失败。
 */
function isolatesMeasurementsByNodeIdentity(): void {
  // `currentNodes` 是只含旧节点身份及其有效测量的当前集合。
  const currentNodes = [flowNode("node-a", { width: 180, height: 96 })];
  // `nextNodes` 是相同数组位置上的全新节点身份。
  const nextNodes = [flowNode("node-b")];

  expect(reconcileReactFlowNodeMeasurements(currentNodes, nextNodes)[0]).toEqual(
    flowNode("node-b"),
  );
}

/**
 * 证明零值、非有限值与缺失值都不会被提升成伪造的有效测量。
 *
 * 参数：无。返回：无。断言：目标节点仍不带宽高。
 * 异常：协调函数填入默认尺寸或继承半套非法尺寸时断言失败。
 */
function doesNotFabricateMeasurement(): void {
  // `currentNodes` 是只有非法或不完整尺寸的当前节点集合。
  const currentNodes = [flowNode("node-a", { width: 0, height: Number.NaN })];
  // `nextNodes` 是没有显式测量的目标节点集合。
  const nextNodes = [flowNode("node-a")];

  expect(reconcileReactFlowNodeMeasurements(currentNodes, nextNodes)[0]).toEqual(
    flowNode("node-a"),
  );
}
