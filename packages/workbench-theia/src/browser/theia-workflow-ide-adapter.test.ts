import { describe, expect, it } from 'vitest'

import { exerciseWorkflowIdeAdapterContract } from '@unilab/workflow-ide-bridge/testing'

import { createTheiaWorkflowIdeAdapter } from './theia-workflow-ide-adapter'

describe('Theia Workflow IDE adapter contract', () => {
  it('passes the shared native-host contract suite', async () => {
    const transcript = await exerciseWorkflowIdeAdapterContract(
      createTheiaWorkflowIdeAdapter
    )
    expect(transcript.reveals).toEqual([
      expect.objectContaining({
        resolvedUri: 'file:///workspace/lab/workflows/main.py',
        line: 9,
        readOnly: false
      }),
      expect.objectContaining({
        resolvedUri: 'file:///workspace/catalog/definitions.py',
        line: 4,
        readOnly: true
      })
    ])
    expect(transcript.snapshots.at(-1)).toMatchObject({
      activeSourceUri: 'package://lab/workflows/main.py',
      sync: { sourcePosition: { line: 10, column: 5 } }
    })
    expect(transcript.diagnosticBatches.at(-1)?.[0]).toMatchObject({
      code: 'contract_error',
      resolvedUri: 'file:///workspace/lab/workflows/main.py'
    })
  })
})
