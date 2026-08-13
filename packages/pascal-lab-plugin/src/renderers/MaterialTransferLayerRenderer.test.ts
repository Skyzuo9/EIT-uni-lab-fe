import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  RobotArmIcon,
  pointAlongPolyline,
  polylineStrokeSegments
} from './MaterialTransferLayerRenderer'

describe('3D 物料（Material）转运路径动画', () => {
  it('按折线路径总长度计算方向光点位置', () => {
    const points: Array<[number, number, number]> = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0]
    ]

    expect(pointAlongPolyline(points, 0.25)).toEqual([1, 0, 0])
    expect(pointAlongPolyline(points, 0.75)).toEqual([2, 1, 0])
  })

  it('将超出范围的进度限制到路径两端', () => {
    const points: Array<[number, number, number]> = [
      [1, 2, 3],
      [4, 5, 6]
    ]

    expect(pointAlongPolyline(points, -1)).toEqual([1, 2, 3])
    expect(pointAlongPolyline(points, 2)).toEqual([4, 5, 6])
  })

  it('把虚线拆成渲染器通用的网格段', () => {
    const segments = polylineStrokeSegments(
      [[0, 0, 0], [0.42, 0, 0]],
      true,
      0.1,
      0.06
    )

    expect(segments).toHaveLength(3)
    for (const segment of segments) {
      expect(segment.length).toBeCloseTo(0.1, 8)
    }
    expect(segments[0]?.position).toEqual([0.05, 0, 0])
  })

  /**
   * 验证执行器（Executor）使用与工作流画布一致的精密细线机械臂图形。
   * 参数：无；直接渲染内部 SVG 图标。
   * 返回：通过断言确认图标身份、48 单位几何与末端夹爪全部存在。
   */
  it('渲染精密细线机械臂执行器图标', () => {
    const markup = renderToStaticMarkup(RobotArmIcon())

    expect(markup).toContain(
      'data-executor-icon="precision-robot-arm"'
    )
    expect(markup).toContain('viewBox="0 0 48 48"')
    expect(markup).toContain('data-robot-gripper="true"')
  })
})
