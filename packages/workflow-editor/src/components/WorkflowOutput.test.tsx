import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WorkflowOutput } from './WorkflowOutput'

describe('WorkflowOutput', () => {
  it('shows the failed node error log in runtime exceptions', () => {
    const html = renderToStaticMarkup(
      <WorkflowOutput
        expanded
        activeTab="errors"
        completedNodeCount={0}
        expectedNodeCount={1}
        nodes={[
          {
            nodeId: 'job-heat',
            sourceNodeId: 'heat',
            nodeType: 'action',
            deviceId: 'heater-1',
            action: 'heat',
            state: 'failed',
            result: {
              error: 'Traceback: heater temperature exceeded limit'
            },
            attempt: 1
          }
        ]}
        nodeNames={{ heat: '加热样品' }}
        events={[]}
        error={null}
        selectedNode={undefined}
        selectedNodeId={null}
        pausedBeforeNodeId={null}
        onExpandedChange={() => {}}
        onTabChange={() => {}}
        onNodeSelect={() => {}}
        onClearError={() => {}}
      />
    )

    expect(html).toContain('加热样品')
    expect(html).toContain('Traceback: heater temperature exceeded limit')
  })

  it('falls back to node exception event logs when the node result is empty', () => {
    const html = renderToStaticMarkup(
      <WorkflowOutput
        expanded
        activeTab="errors"
        completedNodeCount={0}
        expectedNodeCount={1}
        nodes={[
          {
            nodeId: 'job-heat',
            sourceNodeId: 'heat',
            nodeType: 'action',
            deviceId: 'heater-1',
            action: 'heat',
            state: 'failed',
            result: {},
            attempt: 1
          }
        ]}
        nodeNames={{ heat: '加热样品' }}
        events={[
          {
            seq: 7,
            runId: 'run-1',
            type: 'node.exception',
            nodeId: 'job-heat',
            timestamp: 1,
            payload: {
              traceback: 'Traceback: event-only heater failure',
              logs: ['heater stopped', 'safety check required']
            }
          }
        ]}
        error={null}
        selectedNode={undefined}
        selectedNodeId={null}
        pausedBeforeNodeId={null}
        onExpandedChange={() => {}}
        onTabChange={() => {}}
        onNodeSelect={() => {}}
        onClearError={() => {}}
      />
    )

    expect(html).toContain('Traceback: event-only heater failure')
    expect(html).toContain('safety check required')
  })

  it('shows only the selected failed node error log in the node details', () => {
    const selectedNode = {
      nodeId: 'job-heat',
      sourceNodeId: 'heat',
      nodeType: 'action',
      deviceId: 'heater-1',
      action: 'heat',
      state: 'failed' as const,
      result: {},
      attempt: 1
    }
    const html = renderToStaticMarkup(
      <WorkflowOutput
        expanded
        activeTab="nodes"
        completedNodeCount={0}
        expectedNodeCount={2}
        nodes={[
          selectedNode,
          {
            nodeId: 'job-camera',
            sourceNodeId: 'camera',
            nodeType: 'action',
            deviceId: 'camera-1',
            action: 'capture',
            state: 'failed',
            result: {},
            attempt: 1
          }
        ]}
        nodeNames={{ heat: '加热样品', camera: '拍摄样品' }}
        events={[
          {
            seq: 7,
            runId: 'run-1',
            type: 'node.exception',
            nodeId: 'job-heat',
            timestamp: 1,
            payload: { traceback: 'Traceback: selected heater failure' }
          },
          {
            seq: 8,
            runId: 'run-1',
            type: 'node.exception',
            nodeId: 'job-camera',
            timestamp: 2,
            payload: { traceback: 'Traceback: unselected camera failure' }
          }
        ]}
        error={null}
        selectedNode={selectedNode}
        selectedNodeId="job-heat"
        pausedBeforeNodeId={null}
        onExpandedChange={() => {}}
        onTabChange={() => {}}
        onNodeSelect={() => {}}
        onClearError={() => {}}
      />
    )

    const nodePanel = html.slice(
      html.indexOf('id="workflow-output-panel-nodes"'),
      html.indexOf('id="workflow-output-panel-events"')
    )
    expect(nodePanel).toContain('aria-label="加热样品 错误日志"')
    expect(nodePanel).toContain('Traceback: selected heater failure')
    expect(nodePanel).not.toContain('Traceback: unselected camera failure')
    expect(nodePanel).not.toContain('aria-label="加热样品 节点结果"')
  })

  it('shows logs from the selected successful node and its completion event', () => {
    const selectedNode = {
      nodeId: 'job-heat',
      sourceNodeId: 'heat',
      nodeType: 'action',
      deviceId: 'heater-1',
      action: 'heat',
      state: 'success' as const,
      result: {
        stdout: 'heater reached 80 C'
      },
      attempt: 1
    }
    const html = renderToStaticMarkup(
      <WorkflowOutput
        expanded
        activeTab="nodes"
        completedNodeCount={2}
        expectedNodeCount={2}
        nodes={[
          selectedNode,
          {
            nodeId: 'job-camera',
            sourceNodeId: 'camera',
            nodeType: 'action',
            deviceId: 'camera-1',
            action: 'capture',
            state: 'success',
            result: {},
            attempt: 1
          }
        ]}
        nodeNames={{ heat: '加热样品', camera: '拍摄样品' }}
        events={[
          {
            seq: 7,
            runId: 'run-1',
            type: 'node.result',
            nodeId: 'job-heat',
            timestamp: 1,
            payload: {
              logs: ['temperature stable', 'sample heating completed']
            }
          },
          {
            seq: 8,
            runId: 'run-1',
            type: 'node.result',
            nodeId: 'job-camera',
            timestamp: 2,
            payload: { logs: ['camera-only log'] }
          }
        ]}
        error={null}
        selectedNode={selectedNode}
        selectedNodeId="heat"
        pausedBeforeNodeId={null}
        onExpandedChange={() => {}}
        onTabChange={() => {}}
        onNodeSelect={() => {}}
        onClearError={() => {}}
      />
    )

    const nodePanel = html.slice(
      html.indexOf('id="workflow-output-panel-nodes"'),
      html.indexOf('id="workflow-output-panel-events"')
    )
    expect(nodePanel).toContain('aria-label="加热样品 运行日志"')
    expect(nodePanel).toContain('heater reached 80 C')
    expect(nodePanel).toContain('sample heating completed')
    expect(nodePanel).not.toContain('camera-only log')
  })

  it('falls back to successful node lifecycle events when Edge returns no log fields', () => {
    const selectedNode = {
      nodeId: 'heat',
      sourceNodeId: 'heat',
      nodeType: 'action',
      deviceId: 'heater-1',
      action: 'heat',
      state: 'success' as const,
      result: {},
      attempt: 1
    }
    const html = renderToStaticMarkup(
      <WorkflowOutput
        expanded
        activeTab="nodes"
        completedNodeCount={1}
        expectedNodeCount={1}
        nodes={[selectedNode]}
        nodeNames={{ heat: '加热样品' }}
        events={[
          {
            seq: 408,
            runId: 'run-1',
            type: 'node.started',
            nodeId: 'heat',
            timestamp: 1,
            payload: { attempt: 1 }
          },
          {
            seq: 411,
            runId: 'run-1',
            type: 'node.result',
            nodeId: 'heat',
            timestamp: 2,
            payload: { effects: [], result: {} }
          }
        ]}
        error={null}
        selectedNode={selectedNode}
        selectedNodeId="heat"
        pausedBeforeNodeId={null}
        onExpandedChange={() => {}}
        onTabChange={() => {}}
        onNodeSelect={() => {}}
        onClearError={() => {}}
      />
    )

    expect(html).toContain('aria-label="加热样品 运行日志"')
    expect(html).toContain('#408 节点开始执行 (node.started)')
    expect(html).toContain('#411 节点执行成功 (node.result)')
    expect(html).toContain('&quot;effects&quot;: []')
  })
})
