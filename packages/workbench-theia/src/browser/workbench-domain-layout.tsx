import * as React from 'react'
import { useCallback, useRef, useState } from 'react'

import type { WorkbenchViewMode } from './workbench-view-state'

const MIN_WORKFLOW_PERCENT = 30
const MAX_WORKFLOW_PERCENT = 70

export function WorkbenchDomainLayout({
  mode,
  workflow,
  material,
  device
}: {
  mode: WorkbenchViewMode
  workflow: React.ReactNode
  material: React.ReactNode
  device: React.ReactNode
}): React.JSX.Element {
  const layoutRef = useRef<HTMLDivElement>(null)
  const [workflowPercent, setWorkflowPercent] = useState(55)
  const setBoundedPercent = useCallback((value: number) => {
    setWorkflowPercent(Math.min(
      MAX_WORKFLOW_PERCENT,
      Math.max(MIN_WORKFLOW_PERCENT, value)
    ))
  }, [])
  const resizeFromPointer = useCallback((clientX: number) => {
    const bounds = layoutRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    setBoundedPercent(((clientX - bounds.left) / bounds.width) * 100)
  }, [setBoundedPercent])
  const startResize = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    const move = (moveEvent: PointerEvent) => {
      resizeFromPointer(moveEvent.clientX)
    }
    const stop = () => {
      globalThis.removeEventListener('pointermove', move)
      globalThis.removeEventListener('pointerup', stop)
    }
    globalThis.addEventListener('pointermove', move)
    globalThis.addEventListener('pointerup', stop, { once: true })
  }, [resizeFromPointer])
  const resizeFromKeyboard = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setBoundedPercent(workflowPercent + (event.key === 'ArrowLeft' ? -5 : 5))
  }, [setBoundedPercent, workflowPercent])

  const splitStyle = mode === 'split'
    ? {
        gridTemplateColumns:
          `minmax(0, ${workflowPercent}fr) 7px `
          + `minmax(0, ${100 - workflowPercent}fr)`
      }
    : undefined

  return (
    <main
      ref={layoutRef}
      className={`unilab-workbench__domain-layout is-${mode}`}
      data-workbench-view={mode}
      style={splitStyle}
    >
      {mode === 'workflow' || mode === 'split' ? workflow : null}
      {mode === 'split' ? (
        <div
          className="unilab-workbench__splitter"
          role="separator"
          aria-label="调整工作流与物料窗口宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_WORKFLOW_PERCENT}
          aria-valuemax={MAX_WORKFLOW_PERCENT}
          aria-valuenow={workflowPercent}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeFromKeyboard}
        >
          <span aria-hidden="true" />
        </div>
      ) : null}
      {mode === 'material' || mode === 'split' ? material : null}
      {mode === 'device' ? device : null}
    </main>
  )
}
