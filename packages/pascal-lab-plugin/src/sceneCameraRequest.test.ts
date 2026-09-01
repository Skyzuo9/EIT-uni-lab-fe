import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  applySceneCameraRequest,
  frameSceneCaptureCamera,
  insetSceneBounds,
  outsetSceneBounds
} from './sceneCameraRequest'

describe('Pascal 场景相机请求', () => {
  it('先确定性转到垂直顶视，再适配完整场景边界', async () => {
    const calls: string[] = []
    const rotateAzimuthTo = vi.fn()
    const rotatePolarTo = vi.fn(async () => {
      calls.push('rotate')
    })
    const fitToBox = vi.fn(async () => {
      calls.push('fit')
    })

    await applySceneCameraRequest({
      bounds: new Box3(),
      controls: { fitToBox, rotateAzimuthTo, rotatePolarTo },
      padding: 0.2,
      smooth: true,
      view: 'top'
    })

    expect(rotatePolarTo).toHaveBeenCalledWith(0, false)
    expect(fitToBox).toHaveBeenCalledWith(
      expect.any(Box3),
      true,
      {
        paddingBottom: 0.2,
        paddingLeft: 0.2,
        paddingRight: 0.2,
        paddingTop: 0.2
      }
    )
    expect(calls).toEqual(['rotate', 'fit'])
  })

  it('普通场景适配不改变用户当前观察方向', async () => {
    const rotateAzimuthTo = vi.fn()
    const rotatePolarTo = vi.fn()
    const fitToBox = vi.fn()

    await applySceneCameraRequest({
      bounds: new Box3(),
      controls: { fitToBox, rotateAzimuthTo, rotatePolarTo },
      padding: 0.1,
      smooth: false,
      view: 'default'
    })

    expect(rotateAzimuthTo).not.toHaveBeenCalled()
    expect(rotatePolarTo).not.toHaveBeenCalled()
    expect(fitToBox).toHaveBeenCalledOnce()
  })

  it('无显示时钟时同步提交非平滑适配且不等待逐帧 Promise', async () => {
    const neverSettles = new Promise<void>(() => {})
    const update = vi.fn()
    const fitToBox = vi.fn(() => neverSettles)

    await applySceneCameraRequest({
      bounds: new Box3(),
      controls: {
        fitToBox,
        rotateAzimuthTo: vi.fn(),
        rotatePolarTo: vi.fn(),
        update
      },
      padding: 0.1,
      smooth: false,
      view: 'default'
    })

    expect(fitToBox).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith(0)
  })

  it('运动学设备调试预设先转到俯视斜角再局部适配', async () => {
    const calls: string[] = []
    const rotateAzimuthTo = vi.fn(async () => {
      calls.push('azimuth')
    })
    const rotatePolarTo = vi.fn(async () => {
      calls.push('polar')
    })
    const fitToBox = vi.fn(async () => {
      calls.push('fit')
    })

    await applySceneCameraRequest({
      bounds: new Box3(),
      controls: { fitToBox, rotateAzimuthTo, rotatePolarTo },
      padding: 0.1,
      smooth: false,
      view: 'kinematics'
    })

    expect(rotateAzimuthTo).toHaveBeenCalledWith(-Math.PI / 4, false)
    expect(rotatePolarTo).toHaveBeenCalledWith(Math.PI / 3, false)
    expect(calls).toEqual(['azimuth', 'polar', 'fit'])
  })

  it('按通用边界轻微放大观察框且不写死设备身份', () => {
    const bounds = new Box3().setFromArray([
      0, 0, 0,
      10, 4, 6
    ])

    const focused = insetSceneBounds(bounds, 0.06)

    expect(focused.min.toArray()).toEqual([0.6, 0.6, 0.6])
    expect(focused.max.toArray()).toEqual([9.4, 3.4, 5.4])
    expect(bounds.min.toArray()).toEqual([0, 0, 0])
    expect(bounds.max.toArray()).toEqual([10, 4, 6])
  })

  it('为运动学设备局部取景保留可见的场景上下文', () => {
    const bounds = new Box3().setFromArray([
      -0.5, 0, -0.25,
      0.5, 1, 0.25
    ])

    const framed = outsetSceneBounds(bounds, 0.18)

    expect(framed.min.toArray()).toEqual(expect.arrayContaining([
      expect.closeTo(-0.68),
      expect.closeTo(-0.18),
      expect.closeTo(-0.43)
    ]))
    expect(framed.max.toArray()).toEqual(expect.arrayContaining([
      expect.closeTo(0.68),
      expect.closeTo(1.18),
      expect.closeTo(0.43)
    ]))
    expect(bounds.min.toArray()).toEqual([-0.5, 0, -0.25])
  })

  it('截图相机无需逐帧循环即可直接框住当前场景', () => {
    const bounds = new Box3().setFromArray([
      -2, -1, -1,
      2, 1, 1
    ])
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1000)
    camera.position.set(10, 10, 10)

    expect(frameSceneCaptureCamera(bounds, camera, 'default')).toBe(true)
    expect(camera.position.toArray()).not.toEqual([10, 10, 10])
    const forward = new Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize()
    const toCenter = bounds.getCenter(new Vector3())
      .sub(camera.position)
      .normalize()
    expect(forward.dot(toCenter)).toBeGreaterThan(0.999)
  })
})
