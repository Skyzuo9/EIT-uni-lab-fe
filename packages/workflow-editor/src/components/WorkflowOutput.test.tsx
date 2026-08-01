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
            state: 'failed',
            result: {
              error_info: [
                'Traceback: heater temperature exceeded limit'
              ]
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
            state: 'failed',
            result: {},
            attempt: 1
          }
        ]}
        nodeNames={{ heat: '加热样品' }}
        events={[
          {
            key: 'feedback-7',
            seq: 7,
            type: 'node.exception',
            nodeId: 'heat',
            detail: {
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
})
