import type { CapabilityStatus } from '@unilab/services'
import type { WorkbenchEdgeRuntimeSnapshot } from '@unilab/workbench-session'

/**
 * 把受管 Edge Runtime 状态投影为工作流运行门禁。
 *
 * 该状态只管理任务执行，不会关闭 Local 或 Backend 的图定义编辑能力。
 */
export function workflowExecutionStatusForEdge(
  edgeRuntime: Pick<
    WorkbenchEdgeRuntimeSnapshot,
    'phase' | 'message' | 'diagnostic'
  >
): CapabilityStatus {
  if (edgeRuntime.phase === 'ready') return { available: true }
  if (edgeRuntime.phase === 'idle') {
    return {
      available: false,
      reason: 'OS 尚未启动；请先在环境管理中启动 OS'
    }
  }
  if (edgeRuntime.phase === 'starting') {
    return {
      available: false,
      reason: 'OS 正在启动；请等待设备控制就绪'
    }
  }
  if (edgeRuntime.phase === 'stopping') {
    return {
      available: false,
      reason: 'OS 正在停止；请等待停止完成'
    }
  }
  return {
    available: false,
    reason: `OS 未就绪：${
      edgeRuntime.diagnostic || edgeRuntime.message || '请检查环境日志'
    }`
  }
}
