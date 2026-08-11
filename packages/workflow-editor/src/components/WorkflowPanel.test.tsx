import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { WorkflowRuntimePort, WorkflowSummary } from '@unilab/services'

import WorkflowPanel, {
  groupWorkflowCatalog,
  workflowGroupLabel
} from './WorkflowPanel'

describe('WorkflowPanel Runtime entry', () => {
  it('loads the current OS workflow catalog when no Workflow is selected', () => {
    const markup = renderToStaticMarkup(
      <WorkflowPanel runtime={{} as WorkflowRuntimePort} />
    )

    expect(markup).toContain('可用工作流')
    expect(markup).toContain('正在读取工作流')
  })

  it('keeps the Backend catalog read-only when authoring is unavailable', () => {
    const markup = renderToStaticMarkup(
      <WorkflowPanel
        runtime={{} as WorkflowRuntimePort}
        workflowUuid="10000000-0000-4000-8000-000000000001"
        authoringStatus={{
          available: false,
          reason: '工作流创作语义尚未对齐'
        }}
      />
    )

    expect(markup).toContain('当前 Backend 提供只读目录')
    expect(markup).toContain('工作流创作语义尚未对齐')
    expect(markup).not.toContain('workflow-runtime__authoring')
  })

  it('groups catalog entries by station first and declared purpose second', () => {
    const workflows = [
      workflowSummary('S02_离心流程', []),
      workflowSummary('样品归档', ['归档']),
      workflowSummary('临时流程', [])
    ]

    expect(workflowGroupLabel(workflows[0])).toBe('S02 工位')
    expect(groupWorkflowCatalog(workflows).map((group) => group.label)).toEqual([
      'S02 工位',
      '用途 · 归档',
      '未分类'
    ])
  })
})

function workflowSummary(name: string, tags: string[]): WorkflowSummary {
  return {
    uuid: `${name}-uuid`,
    create_time: '2026-08-01T00:00:00Z',
    update_time: '2026-08-11T00:00:00Z',
    meta_data: {},
    name,
    tags,
    revision: 1
  }
}
