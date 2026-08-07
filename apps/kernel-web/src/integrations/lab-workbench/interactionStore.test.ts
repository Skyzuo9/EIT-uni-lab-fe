import { describe, expect, it } from 'vitest'

import { createLabInteractionStore } from './interactionStore'

const ROUTE = {
  id: 'route-1',
  workflowNodeUuid: 'step-1',
  label: '烧杯转运',
  source: { ownerMaterialId: 'source', siteKey: 'L1B1' },
  target: { ownerMaterialId: 'target', siteKey: 'S0721' },
  executorId: 'robot',
  status: 'planned' as const,
  materialRole: 'primary_sample',
  materialLineageKey: 'sample-source',
  accent: '#7c3aed'
}

describe('lab interaction store', () => {
  it('coordinates identities without copying feature documents', () => {
    const store = createLabInteractionStore()

    store.getState().selectMaterials(['material-1'])
    store.getState().activateWorkflowPanel('panel-2', 'workflow-2')
    store.getState().selectWorkflowStep('panel-2', 'step-3')
    store.getState().setWorkflowMaterialRoleFilter(
      'panel-2',
      'primary_sample'
    )
    store.getState().publishWorkflowRuntime('panel-2', {
      workflowUuid: 'workflow-2',
      taskUuid: 'task-4',
      generation: 7,
      materialTransferRoutes: [ROUTE]
    })
    store.getState().selectSceneObjects(['scene-object-9'])

    expect(store.getState()).toMatchObject({
      selectedMaterialIds: ['material-1'],
      activeWorkflowPanelId: 'panel-2',
      activeWorkflowId: 'workflow-2',
      activeWorkflowTaskId: 'task-4',
      activeWorkflowRuntimeGeneration: 7,
      activeWorkflowMaterialTransferRoutes: [ROUTE],
      activeWorkflowMaterialRoleFilter: 'primary_sample',
      selectedWorkflowStepId: 'step-3',
      selectedSceneObjectIds: ['scene-object-9']
    })

    store.getState().clearInteraction()

    expect(store.getState()).toMatchObject({
      selectedMaterialIds: [],
      highlightedMaterialIds: [],
      activeWorkflowPanelId: null,
      activeWorkflowId: null,
      activeWorkflowTaskId: null,
      activeWorkflowRuntimeGeneration: 0,
      activeWorkflowMaterialTransferRoutes: [],
      activeWorkflowMaterialRoleFilter: null,
      selectedWorkflowStepId: null,
      selectedSceneObjectIds: []
    })
  })

  it('does not publish duplicate identity selections', () => {
    const store = createLabInteractionStore()
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })

    store.getState().selectMaterials([])
    store.getState().selectSceneObjects([])
    store.getState().highlightMaterials([])
    store.getState().deactivateWorkflowPanel('missing-panel')
    expect(notifications).toBe(0)

    store.getState().selectMaterials(['material-1'])
    store.getState().selectMaterials(['material-1'])
    expect(notifications).toBe(1)

    store.getState().activateWorkflowPanel('panel-1', 'workflow-1')
    store.getState().activateWorkflowPanel('panel-1', 'workflow-1')
    expect(notifications).toBe(2)

    unsubscribe()
  })

  it('rejects a cached projection from another Workflow in the same panel', () => {
    const store = createLabInteractionStore()
    store.getState().activateWorkflowPanel('panel-1', 'workflow-new')

    store.getState().publishWorkflowRuntime('panel-1', {
      workflowUuid: 'workflow-old',
      taskUuid: 'task-old',
      generation: 8,
      materialTransferRoutes: [ROUTE]
    })

    expect(store.getState()).toMatchObject({
      activeWorkflowId: 'workflow-new',
      activeWorkflowTaskId: null,
      activeWorkflowRuntimeGeneration: 0,
      activeWorkflowMaterialTransferRoutes: []
    })
  })

  /**
   * 验证隐藏或卸载的旧面板不能清除当前可见工作流（Workflow）的稳定身份。
   * 输入两个面板的交错更新；输出始终由最后激活的面板拥有。
   */
  it('ignores stale runtime and cleanup updates from an inactive Workflow panel', () => {
    const store = createLabInteractionStore()

    store.getState().activateWorkflowPanel('panel-a', 'workflow-a')
    store.getState().publishWorkflowRuntime('panel-a', {
      workflowUuid: 'workflow-a',
      taskUuid: 'task-a',
      generation: 2,
      materialTransferRoutes: []
    })
    store.getState().activateWorkflowPanel('panel-b', 'workflow-b')
    store.getState().publishWorkflowRuntime('panel-b', {
      workflowUuid: 'workflow-b',
      taskUuid: 'task-b',
      generation: 5,
      materialTransferRoutes: [ROUTE]
    })
    store.getState().publishWorkflowRuntime('panel-a', {
      workflowUuid: 'workflow-a',
      taskUuid: 'task-a-new',
      generation: 9,
      materialTransferRoutes: []
    })
    store.getState().selectWorkflowStep('panel-a', 'step-a')
    store.getState().setWorkflowMaterialRoleFilter('panel-a', 'reagent')
    store.getState().deactivateWorkflowPanel('panel-a')

    expect(store.getState()).toMatchObject({
      activeWorkflowPanelId: 'panel-b',
      activeWorkflowId: 'workflow-b',
      activeWorkflowTaskId: 'task-b',
      activeWorkflowRuntimeGeneration: 5,
      activeWorkflowMaterialTransferRoutes: [ROUTE],
      activeWorkflowMaterialRoleFilter: null,
      selectedWorkflowStepId: null
    })
  })
})
