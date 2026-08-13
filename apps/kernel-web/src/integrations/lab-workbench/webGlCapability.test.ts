import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 清理能力探测测试注入的浏览器全局和模块缓存。
 *
 * 无参数，无返回值；让每个测试获得独立的能力探测状态。
 */
function resetCapabilityTestState(): void {
  vi.unstubAllGlobals()
  vi.resetModules()
}

/**
 * 注册 WebGL 能力探测的回归测试。
 *
 * 无参数，无返回值；测试失败时由 Vitest 报告断言异常。
 */
function defineWebGlCapabilityTests(): void {
  /**
   * 验证三维场景（3D Scene）重复渲染只执行一次 WebGL 能力探测，并立即释放探测上下文。
   *
   * 无参数；断言失败时由 Vitest 抛出异常；无返回值。
   */
  async function reusesAndReleasesWebGlProbe(): Promise<void> {
    const loseContext = vi.fn()
    const getExtension = vi.fn().mockReturnValue({ loseContext })
    const getContext = vi.fn().mockReturnValue({ getExtension })
    const createElement = vi.fn().mockReturnValue({ getContext })
    vi.stubGlobal('document', { createElement })

    const { supportsWebGl } = await import('./webGlCapability')

    for (let render = 0; render < 12; render += 1) {
      expect(supportsWebGl()).toBe(true)
    }

    expect(createElement).toHaveBeenCalledTimes(1)
    expect(createElement).toHaveBeenCalledWith('canvas')
    expect(getContext).toHaveBeenCalledTimes(1)
    expect(getContext).toHaveBeenCalledWith('webgl2')
    expect(getExtension).toHaveBeenCalledOnce()
    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context')
    expect(loseContext).toHaveBeenCalledOnce()
  }

  it('重复调用时只创建并释放一个临时上下文', reusesAndReleasesWebGlProbe)
}

afterEach(resetCapabilityTestState)
describe('WebGL 能力探测', defineWebGlCapabilityTests)
