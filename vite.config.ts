import { resolve } from 'path'
import { defineConfig } from 'vite'

// 纯浏览器预览配置（仅渲染层，不启动 Electron）：
// 用 `npm run dev:web` 在浏览器中查看画布，便于无窗口环境下验证。
// 说明：index.html 的 CSP 为 script-src 'self'，因此不使用 @vitejs/plugin-react
// （其注入的内联预热脚本会被 CSP 拦截）；改用 esbuild 的 automatic JSX 直接转换。
export default defineConfig({
  root: 'src/renderer',
  server: {
    port: 5173,
    strictPort: true
  },
  esbuild: {
    jsx: 'automatic'
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  }
})
