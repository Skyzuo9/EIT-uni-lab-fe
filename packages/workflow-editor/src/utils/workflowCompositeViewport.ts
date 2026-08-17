type RequestFrame = (callback: FrameRequestCallback) => number
type CancelFrame = (handle: number) => void

interface WorkflowCompositeFitViewOptions {
  isReady?: () => boolean
  requestFrame?: RequestFrame
  cancelFrame?: CancelFrame
  maxFrames?: number
}

/** Check that React Flow has installed the exact expanded projection. */
export function workflowCompositeProjectionReady(
  projectedNodeIds: readonly string[],
  renderedNodeIds: readonly string[]
): boolean {
  if (projectedNodeIds.length !== renderedNodeIds.length) return false
  const rendered = new Set(renderedNodeIds)
  return projectedNodeIds.every((nodeId) => rendered.has(nodeId))
}

/**
 * 在两次浏览器绘制之后适配展开的组合工作流视图。
 *
 * 第一次绘制让 React Flow 提交新的父子节点尺寸，第二次绘制确保嵌套容器已经
 * 依据内层实测尺寸完成投影。返回的清理函数用于取消被后续展开操作取代的适配。
 */
export function scheduleWorkflowCompositeFitView(
  fitView: () => void,
  options: WorkflowCompositeFitViewOptions = {}
): () => void {
  const requestFrame = options.requestFrame ?? ((callback) => (
    globalThis.setTimeout(() => callback(performance.now()), 16) as unknown as number
  ))
  const cancelFrame = options.cancelFrame ?? ((handle) => {
    globalThis.clearTimeout(handle)
  })
  const isReady = options.isReady ?? (() => true)
  const maxFrames = options.maxFrames ?? 120
  let cancelled = false
  let attemptedFrames = 0
  let consecutiveReadyFrames = 0
  const frameHandles: number[] = []
  const requestNextFrame = (): void => {
    const handle = requestFrame(() => {
      attemptedFrames += 1
      consecutiveReadyFrames = isReady()
        ? consecutiveReadyFrames + 1
        : 0
      if (cancelled) return
      if (consecutiveReadyFrames >= 2) {
        fitView()
        return
      }
      if (attemptedFrames < maxFrames) requestNextFrame()
    })
    frameHandles.push(handle)
  }
  requestNextFrame()
  return () => {
    cancelled = true
    for (const handle of frameHandles) cancelFrame(handle)
  }
}
