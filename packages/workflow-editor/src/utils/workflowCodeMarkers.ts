import type { CodeLineMarker } from '@unilab/code-editor'

export interface WorkflowCodeMarkerProjection {
  nodeIds: ReadonlyArray<string>
  resolveLine: (nodeId: string) => number | null
  startNodeId: string | null
  beforeStartNodeIds: ReadonlySet<string>
  breakpoints: ReadonlySet<string>
  pausedBeforeNodeId: string | null
  nodeStates: Readonly<Record<string, string>>
}

export function projectWorkflowCodeMarkers(
  projection: WorkflowCodeMarkerProjection
): CodeLineMarker[] {
  const markers: CodeLineMarker[] = []
  for (const nodeId of projection.nodeIds) {
    const line = projection.resolveLine(nodeId)
    if (!line) continue
    if (projection.beforeStartNodeIds.has(nodeId)) {
      markers.push({
        nodeId,
        line,
        kind: 'before-start',
        label: '不执行'
      })
    } else {
      const state = projection.nodeStates[nodeId]
      if (state === 'running') {
        markers.push({
          nodeId,
          line,
          kind: 'running',
          label: '正在运行'
        })
      } else if (state === 'success') {
        markers.push({
          nodeId,
          line,
          kind: 'success',
          label: '成功'
        })
      } else if (state === 'failed' || state === 'reconciling') {
        markers.push({
          nodeId,
          line,
          kind: 'failed',
          label: '失败'
        })
      } else if (state === 'skipped') {
        markers.push({
          nodeId,
          line,
          kind: 'skipped',
          label: '已跳过'
        })
      }
    }
    if (projection.startNodeId === nodeId) {
      markers.push({
        nodeId,
        line,
        kind: 'start',
        label: '⚑ 起始点'
      })
    }
    if (projection.breakpoints.has(nodeId)) {
      markers.push({
        nodeId,
        line,
        kind: 'breakpoint',
        label: '● 断点'
      })
    }
    if (projection.pausedBeforeNodeId === nodeId) {
      markers.push({
        nodeId,
        line,
        kind: 'paused',
        label: '下一步'
      })
    }
  }
  return markers
}
