import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const dagPath = fileURLToPath(new URL('./WorkflowDag.tsx', import.meta.url))

describe('WorkflowDag viewport authority', () => {
  it('fits once on initialization and preserves manual zoom across layout changes', () => {
    const source = readFileSync(dagPath, 'utf8')

    expect(source).toContain('fitViewOptions={WORKFLOW_FIT_VIEW_OPTIONS}')
    expect(source).toContain('showFitView={false}')
    expect(source).toContain('onClick={fitWorkflowView}')
    expect(source).toContain('适应视图')
    expect(source).not.toContain('ResizeObserver')
    expect(source).not.toContain('graphSignature')
  })
})
