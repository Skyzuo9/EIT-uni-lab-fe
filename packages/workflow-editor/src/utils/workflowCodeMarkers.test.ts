import { describe, expect, it } from 'vitest'

import { projectWorkflowCodeMarkers } from './workflowCodeMarkers'

describe('Workflow code marker projection', () => {
  it('uses the same source lines for execution scope, debug config and runtime state', () => {
    const lines = new Map([
      ['prepare', 8],
      ['analyze', 10]
    ])

    expect(projectWorkflowCodeMarkers({
      nodeIds: ['prepare', 'analyze'],
      resolveLine: (nodeId) => lines.get(nodeId) ?? null,
      startNodeId: 'analyze',
      beforeStartNodeIds: new Set(['prepare']),
      breakpoints: new Set(['analyze']),
      pausedBeforeNodeId: 'analyze',
      nodeStates: {
        prepare: 'running',
        analyze: 'success'
      }
    })).toEqual([
      {
        nodeId: 'prepare',
        line: 8,
        kind: 'before-start',
        label: '不执行'
      },
      {
        nodeId: 'analyze',
        line: 10,
        kind: 'success',
        label: '成功'
      },
      {
        nodeId: 'analyze',
        line: 10,
        kind: 'start',
        label: '⚑ 起始点'
      },
      {
        nodeId: 'analyze',
        line: 10,
        kind: 'breakpoint',
        label: '● 断点'
      },
      {
        nodeId: 'analyze',
        line: 10,
        kind: 'paused',
        label: '下一步'
      }
    ])
  })
})
