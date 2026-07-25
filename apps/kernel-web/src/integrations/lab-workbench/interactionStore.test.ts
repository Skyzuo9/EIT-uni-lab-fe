import { describe, expect, it } from 'vitest'

import { createLabInteractionStore } from './interactionStore'

describe('lab interaction store', () => {
  it('coordinates identities without copying feature documents', () => {
    const store = createLabInteractionStore()

    store.getState().selectMaterials(['material-1'])
    store.getState().selectWorkflowStep('step-3')
    store.getState().selectSceneObjects(['scene-object-9'])

    expect(store.getState()).toMatchObject({
      selectedMaterialIds: ['material-1'],
      selectedWorkflowStepId: 'step-3',
      selectedSceneObjectIds: ['scene-object-9']
    })

    store.getState().clearInteraction()

    expect(store.getState()).toMatchObject({
      selectedMaterialIds: [],
      highlightedMaterialIds: [],
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
    expect(notifications).toBe(0)

    store.getState().selectMaterials(['material-1'])
    store.getState().selectMaterials(['material-1'])
    expect(notifications).toBe(1)

    unsubscribe()
  })
})
