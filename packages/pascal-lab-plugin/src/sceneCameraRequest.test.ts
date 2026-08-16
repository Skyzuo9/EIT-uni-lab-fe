import { Box3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  applySceneCameraRequest,
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

    const framed = outsetSceneBounds(bounds, 0.38)

    expect(framed.min.toArray()).toEqual([-0.88, -0.38, -0.63])
    expect(framed.max.toArray()).toEqual([0.88, 1.38, 0.63])
    expect(bounds.min.toArray()).toEqual([-0.5, 0, -0.25])
  })
})
