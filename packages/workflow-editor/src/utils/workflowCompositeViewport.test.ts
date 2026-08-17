import { describe, expect, it, vi } from 'vitest'

import {
  scheduleWorkflowCompositeFitView,
  workflowCompositeProjectionReady
} from './workflowCompositeViewport'

describe('workflow composite viewport fitting', () => {
  it('waits until the rendered node set matches the expanded projection', () => {
    expect(workflowCompositeProjectionReady(
      ['outer', 'inner', 'leaf'],
      ['outer']
    )).toBe(false)
    expect(workflowCompositeProjectionReady(
      ['outer', 'inner', 'leaf'],
      ['leaf', 'outer', 'inner']
    )).toBe(true)
  })

  it('waits for two painted frames before fitting an expanded nested graph', () => {
    const callbacks: FrameRequestCallback[] = []
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const cancelFrame = vi.fn()
    const fitView = vi.fn()

    scheduleWorkflowCompositeFitView(fitView, {
      requestFrame,
      cancelFrame
    })

    expect(fitView).not.toHaveBeenCalled()
    callbacks.shift()?.(0)
    expect(fitView).not.toHaveBeenCalled()
    callbacks.shift()?.(16)
    expect(fitView).toHaveBeenCalledOnce()
  })

  it('polls until React Flow has installed measured projected nodes', () => {
    const callbacks: FrameRequestCallback[] = []
    let nextHandle = 0
    let ready = false
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      nextHandle += 1
      return nextHandle
    })
    const fitView = vi.fn()

    scheduleWorkflowCompositeFitView(fitView, {
      isReady: () => ready,
      requestFrame,
      cancelFrame: vi.fn()
    })
    callbacks.shift()?.(0)
    expect(fitView).not.toHaveBeenCalled()
    ready = true
    callbacks.shift()?.(16)
    expect(fitView).not.toHaveBeenCalled()
    callbacks.shift()?.(32)
    expect(fitView).toHaveBeenCalledOnce()
  })

  it('cancels both pending frames when another expansion supersedes it', () => {
    const callbacks: FrameRequestCallback[] = []
    let nextHandle = 0
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      nextHandle += 1
      return nextHandle
    })
    const cancelFrame = vi.fn()
    const fitView = vi.fn()
    const cancel = scheduleWorkflowCompositeFitView(
      fitView,
      { requestFrame, cancelFrame }
    )

    callbacks.shift()?.(0)
    cancel()
    callbacks.shift()?.(16)

    expect(cancelFrame).toHaveBeenCalledWith(1)
    expect(cancelFrame).toHaveBeenCalledWith(2)
    expect(fitView).not.toHaveBeenCalled()
  })
})
