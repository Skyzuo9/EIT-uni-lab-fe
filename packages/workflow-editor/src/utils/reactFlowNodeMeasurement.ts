import type { Node } from 'reactflow'

/**
 * 判断流程画布节点是否携带可用于初始化的完整测量。
 *
 * 参数：`node` 是待检查的 React Flow（流程画布引擎）节点。
 * 返回：宽高都为正有限数时返回 `true`，否则返回 `false`。
 * 异常：不抛出异常；缺失、空值、零值和非有限值均按无效测量处理。
 */
function hasValidMeasurement(node: Pick<Node, 'width' | 'height'>): boolean {
  return (
    typeof node.width === 'number' &&
    Number.isFinite(node.width) &&
    node.width > 0 &&
    typeof node.height === 'number' &&
    Number.isFinite(node.height) &&
    node.height > 0
  )
}

/**
 * 在受控节点集合重建时按稳定身份保持 React Flow（流程画布引擎）测量。
 *
 * 参数：`currentNodes` 是引擎当前节点，`nextNodes` 是目录或布局生成的下一版节点。
 * 返回：下一版节点的顺序与内容；下一版显式有效宽高优先，否则仅同身份节点可继承
 * 当前完整有效宽高。没有可靠测量时不填默认值。
 * 异常：不抛出异常；重复身份沿用当前集合最后一个节点，与 `Map` 的确定性语义一致。
 */
export function reconcileReactFlowNodeMeasurements<
  Data,
  NodeType extends string | undefined = string | undefined,
>(
  currentNodes: readonly Node<Data, NodeType>[],
  nextNodes: readonly Node<Data, NodeType>[],
): Node<Data, NodeType>[] {
  // `currentNodesById` 是当前流程画布节点测量按稳定身份建立的只读索引。
  const currentNodesById = new Map<string, Node<Data, NodeType>>()
  for (const currentNode of currentNodes) {
    currentNodesById.set(currentNode.id, currentNode)
  }

  const reconciledNodes: Node<Data, NodeType>[] = []
  for (const nextNode of nextNodes) {
    if (hasValidMeasurement(nextNode)) {
      reconciledNodes.push(nextNode)
      continue
    }

    // `currentNode` 是与下一版节点身份完全一致的当前测量来源。
    const currentNode = currentNodesById.get(nextNode.id)
    if (!currentNode || !hasValidMeasurement(currentNode)) {
      reconciledNodes.push(nextNode)
      continue
    }

    reconciledNodes.push({
      ...nextNode,
      width: currentNode.width,
      height: currentNode.height,
    })
  }
  return reconciledNodes
}
