import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { WorkflowRuntimePort } from '@unilab/services'

import WorkflowPanel from './WorkflowPanel'

describe('WorkflowPanel Runtime entry', () => {
  it('loads the current OS workflow catalog when no Workflow is selected', () => {
    const markup = renderToStaticMarkup(
      <WorkflowPanel runtime={{} as WorkflowRuntimePort} />
    )

    expect(markup).toContain('可用工作流')
    expect(markup).toContain('正在读取工作流')
  })
})
