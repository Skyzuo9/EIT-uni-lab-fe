import { describe, expect, it } from 'vitest'

import { normalizeBoundsForZoom } from './deviceCardRuntimeValidation'

/**
 * 验证非默认主窗口缩放下，Renderer CSS 边界会转换成 Electron 原生视图边界。
 *
 * @returns 无；断言失败时由 Vitest 报告。
 */
function convertsRendererBoundsAtNonDefaultZoom(): void {
  expect(normalizeBoundsForZoom(
    { x: 600, y: 360, width: 1_200, height: 900 },
    5 / 6
  )).toEqual({ x: 500, y: 300, width: 1_000, height: 750 })
}

/**
 * 验证默认缩放下，Renderer CSS 边界保持原值。
 *
 * @returns 无；断言失败时由 Vitest 报告。
 */
function keepsRendererBoundsAtDefaultZoom(): void {
  expect(normalizeBoundsForZoom(
    { x: 600, y: 360, width: 1_200, height: 900 },
    1
  )).toEqual({ x: 600, y: 360, width: 1_200, height: 900 })
}

/**
 * 注册设备卡原生视图边界换算的回归测试。
 *
 * @returns 无；断言失败时由 Vitest 报告。
 */
function registerDeviceCardBoundsTests(): void {
  it('按非默认缩放换算 Renderer CSS 边界', convertsRendererBoundsAtNonDefaultZoom)
  it('默认缩放保持 Renderer CSS 边界', keepsRendererBoundsAtDefaultZoom)
}

describe('设备卡原生视图边界换算', registerDeviceCardBoundsTests)
