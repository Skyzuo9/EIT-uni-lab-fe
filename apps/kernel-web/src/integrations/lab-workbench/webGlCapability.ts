let cachedWebGlSupport: boolean | undefined

/**
 * 检查并缓存当前浏览器是否能够创建 WebGL 上下文。
 *
 * 无参数。服务端或测试环境没有 document 时返回 true，让实际查看器决定是否降级；
 * 浏览器环境返回 WebGL2 或 WebGL 上下文是否可用。能力探测只执行一次，并在
 * 得到结果后立即释放临时上下文，避免三维视图重渲染耗尽浏览器上下文配额。
 */
export function supportsWebGl(): boolean {
  if (cachedWebGlSupport !== undefined) return cachedWebGlSupport
  if (typeof document === 'undefined') return true

  const canvas = document.createElement('canvas')
  let context: WebGL2RenderingContext | WebGLRenderingContext | null = null

  try {
    context =
      canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    cachedWebGlSupport = context !== null
  } catch {
    cachedWebGlSupport = false
  } finally {
    context
      ?.getExtension('WEBGL_lose_context')
      ?.loseContext()
  }

  return cachedWebGlSupport
}
