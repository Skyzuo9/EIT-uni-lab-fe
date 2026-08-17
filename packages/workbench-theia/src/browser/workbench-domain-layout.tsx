import * as React from 'react'
import { useCallback, useRef, useState } from 'react'

import {
  isRobotWorkbenchViewMode,
  type WorkbenchViewMode
} from './workbench-view-state'

const MIN_WORKFLOW_PERCENT = 30
const MAX_WORKFLOW_PERCENT = 70

/**
 * 组合 Workbench 的领域主区，并在双栏模式提供分隔器。
 *
 * 机械臂调试模式把设备卡片置于左栏、物料（Material）3D 置于右栏；普通
 * 工作流（Workflow）模式仍由隐藏状态选择原来的工作流左栏。
 * @param props 当前模式及已经按需挂载的领域界面。
 * @returns 复用同一主区、不会创建第二侧栏的 Workbench 布局。
 */
export function WorkbenchDomainLayout({
  mode,
  workflow,
  material,
  device,
  robotWorkstation
}: {
  mode: WorkbenchViewMode
  workflow: React.ReactNode
  material: React.ReactNode
  device: React.ReactNode
  robotWorkstation: React.ReactNode
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

  const splitMode = mode === 'split' || mode === 'material-device'
    || mode === 'material-robot-debug'
  const splitStyle = splitMode
    ? {
        gridTemplateColumns:
          `minmax(0, ${workflowPercent}fr) 7px `
          + `minmax(0, ${100 - workflowPercent}fr)`
      }
    : undefined
  const workflowVisible = mode === 'workflow' || mode === 'split'
  const materialVisible = mode === 'material' || mode === 'split'
    || mode === 'material-device' || mode === 'material-robot-debug'
  const deviceVisible = mode === 'device' || mode === 'material-device'
  const robotWorkstationVisible = isRobotWorkbenchViewMode(mode)
    || mode === 'material-robot-debug'

  return (
    <main
      ref={layoutRef}
      className={`unilab-workbench__domain-layout is-${mode}`}
      data-workbench-view={mode}
      style={splitStyle}
    >
      <div
        className={`unilab-workbench__domain-slot is-robot-workstation${
          robotWorkstationVisible ? '' : ' is-inactive'
        }`}
        aria-hidden={!robotWorkstationVisible}
        inert={!robotWorkstationVisible}
      >
        {robotWorkstation}
      </div>
      <div
        className={`unilab-workbench__domain-slot is-workflow${
          workflowVisible ? '' : ' is-inactive'
        }`}
        aria-hidden={!workflowVisible}
        inert={!workflowVisible}
      >
        {workflow}
      </div>
      <div
        className={`unilab-workbench__domain-slot is-device${
          deviceVisible ? '' : ' is-inactive'
        }`}
        aria-hidden={!deviceVisible}
        inert={!deviceVisible}
      >
        {device}
      </div>
      <div
        className="unilab-workbench__splitter"
        role="separator"
        aria-label={mode === 'material-robot-debug'
          ? '调整物料与机械臂调试窗口宽度'
          : mode === 'material-device'
            ? '调整仪器设备与物料窗口宽度'
            : '调整工作流与物料窗口宽度'}
        aria-orientation="vertical"
        aria-valuemin={MIN_WORKFLOW_PERCENT}
        aria-valuemax={MAX_WORKFLOW_PERCENT}
        aria-valuenow={workflowPercent}
        hidden={!splitMode}
        tabIndex={splitMode ? 0 : -1}
        onPointerDown={startResize}
        onKeyDown={resizeFromKeyboard}
      >
        <span aria-hidden="true" />
      </div>
      <div
        className={`unilab-workbench__domain-slot is-material${
          materialVisible ? '' : ' is-inactive'
        }`}
        aria-hidden={!materialVisible}
        inert={!materialVisible}
      >
        {material}
      </div>
    </main>
  )
}
