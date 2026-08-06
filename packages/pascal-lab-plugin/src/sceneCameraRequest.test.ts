import { Box3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { applySceneCameraRequest } from './sceneCameraRequest'

describe('Pascal 场景相机请求', () => {
  it('先确定性转到垂直顶视，再适配完整场景边界', async () => {
    const calls: string[] = []
    const rotatePolarTo = vi.fn(async () => {
      calls.push('rotate')
    })
    const fitToBox = vi.fn(async () => {
      calls.push('fit')
    })

    await applySceneCameraRequest({
      bounds: new Box3(),
      controls: { fitToBox, rotatePolarTo },
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
    const rotatePolarTo = vi.fn()
    const fitToBox = vi.fn()

    await applySceneCameraRequest({
      bounds: new Box3(),
      controls: { fitToBox, rotatePolarTo },
      padding: 0.1,
      smooth: false,
      view: 'default'
    })

    expect(rotatePolarTo).not.toHaveBeenCalled()
    expect(fitToBox).toHaveBeenCalledOnce()
  })
})
