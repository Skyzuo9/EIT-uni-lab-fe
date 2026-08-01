import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { WorkflowRuntimePort } from '@unilab/services'

import WorkflowPanel from './WorkflowPanel'

describe('WorkflowPanel Runtime entry', () => {
  it('fails closed when no applied Workflow UUID is selected', () => {
    const markup = renderToStaticMarkup(
      <WorkflowPanel runtime={{} as WorkflowRuntimePort} />
    )

    expect(markup).toContain('请选择一个已应用的工作流')
  })
})
