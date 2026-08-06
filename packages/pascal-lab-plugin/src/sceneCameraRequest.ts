import type { Box3, Object3D } from 'three'

export type SceneCameraView = 'default' | 'top'

export interface SceneCameraControls {
  fitToBox: (
    boxOrObject: Box3 | Object3D,
    smooth: boolean,
    options?: {
      paddingLeft?: number
      paddingRight?: number
      paddingTop?: number
      paddingBottom?: number
    }
  ) => Promise<void> | void
  rotatePolarTo: (
    polarAngle: number,
    smooth: boolean
  ) => Promise<void> | void
}

/**
 * 将用户的场景观察意图确定性地应用到 Pascal 相机控制器。
 *
 * @param request 场景边界、相机控制器、动画和目标观察方向。
 * @returns 相机方向与全场景取景均应用完成后返回。
 */
export async function applySceneCameraRequest(request: {
  bounds: Box3
  controls: SceneCameraControls
  padding: number
  smooth: boolean
  view: SceneCameraView
}): Promise<void> {
  const {
    bounds,
    controls,
    padding,
    smooth,
    view
  } = request
  if (view === 'top') {
    await controls.rotatePolarTo(0, false)
  }
  await controls.fitToBox(bounds, smooth, {
    paddingBottom: padding,
    paddingLeft: padding,
    paddingRight: padding,
    paddingTop: padding
  })
}
