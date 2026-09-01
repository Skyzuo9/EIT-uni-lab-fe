import {
  type Camera,
  Vector3,
  type Box3,
  type Object3D
} from 'three'

export type SceneCameraView = 'default' | 'top' | 'kinematics'

export const PASCAL_CAPTURE_FIT_EVENT = 'unilab:pascal-capture-fit-scene'

/**
 * 不依赖 CameraControls 动画循环，直接把截图相机框到当前 Three 场景边界。
 */
export function frameSceneCaptureCamera(
  bounds: Box3,
  camera: Camera,
  view: SceneCameraView
): boolean {
  if (bounds.isEmpty()) return false
  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(longest) || longest <= 0) return false
  const direction = view === 'top'
    ? new Vector3(0, 1, 0.001)
    : view === 'kinematics'
      ? new Vector3(-1, 0.8, 1)
      : new Vector3(1, 0.8, 1)
  direction.normalize()
  camera.position.copy(center).addScaledVector(direction, longest * 2.1)
  camera.up.set(0, 1, 0)
  if (view === 'top') camera.up.set(0, 0, -1)
  camera.lookAt(center)
  camera.updateMatrixWorld(true)
  if ('updateProjectionMatrix' in camera) {
    ;(camera as Camera & { updateProjectionMatrix(): void })
      .updateProjectionMatrix()
  }
  return true
}

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
  rotateAzimuthTo: (
    azimuthAngle: number,
    smooth: boolean
  ) => Promise<void> | void
  rotatePolarTo: (
    polarAngle: number,
    smooth: boolean
  ) => Promise<void> | void
  /** 无显示时钟时把非平滑相机命令立即提交到 Three camera。 */
  update?: (deltaSeconds: number) => boolean | void
}

/**
 * 从当前可见场景边界向内收取一圈观察范围，让主体在适配后仍可辨认。
 *
 * @param bounds 当前可见对象计算出的边界；函数不会修改输入。
 * @param ratio 按最长边计算的内收比例，允许范围为 0 到 0.2。
 * @returns 保持有效且不反转的克隆边界。
 */
export function insetSceneBounds(bounds: Box3, ratio: number): Box3 {
  const focused = bounds.clone()
  if (focused.isEmpty()) return focused
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 0.2) {
    throw new RangeError('场景观察内收比例必须位于 [0, 0.2]')
  }
  const size = focused.getSize(new Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  const shortest = Math.min(size.x, size.y, size.z)
  const inset = Math.min(longest * ratio, shortest * 0.45)
  focused.min.addScalar(inset)
  focused.max.addScalar(-inset)
  return focused
}

/**
 * 在局部目标四周保留上下文空间，避免运动学设备被贴边裁切。
 *
 * @param bounds 局部目标的世界边界；函数不会修改输入。
 * @param ratio 按最长边向四周扩出的比例。
 * @returns 带上下文留白的克隆边界。
 */
export function outsetSceneBounds(bounds: Box3, ratio: number): Box3 {
  const framed = bounds.clone()
  if (framed.isEmpty()) return framed
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 2) {
    throw new RangeError('局部观察外扩比例必须位于 [0, 2]')
  }
  const size = framed.getSize(new Vector3())
  const outset = Math.max(size.x, size.y, size.z) * ratio
  return framed.expandByScalar(outset)
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
  const commit = async (command: () => Promise<void> | void): Promise<void> => {
    const completion = command()
    if (!smooth) {
      // CameraControls 即使在 transition=false 时也可能把 Promise 的完成
      // 留到下一次 update。无显示时钟的 renderer 没有下一帧，因此先同步
      // 提交 current/end 状态，且不等待这个逐帧 Promise。
      controls.update?.(0)
      return
    }
    await completion
  }
  if (view === 'top') {
    await commit(() => controls.rotatePolarTo(0, false))
  } else if (view === 'kinematics') {
    await commit(() => controls.rotateAzimuthTo(-Math.PI / 4, false))
    await commit(() => controls.rotatePolarTo(Math.PI / 3, false))
  }
  await commit(() => controls.fitToBox(bounds, smooth, {
    paddingBottom: padding,
    paddingLeft: padding,
    paddingRight: padding,
    paddingTop: padding
  }))
}
