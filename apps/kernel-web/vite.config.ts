import { resolve } from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// kernel-web 是浏览器与 Electron 共同使用的唯一 renderer。
export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss()],
  // @pascal-app/* 以 Next.js 目标的 TS 源码分发，模块顶层直接读 process.env.*
  //（NODE_ENV / NEXT_PUBLIC_* 等），假设由 Next 在构建期替换。本 renderer 是纯 Vite，
  // 浏览器/Electron 无 process 全局，故在此构建期注入 process.env，否则加载 3D 编辑器
  // 即抛 ReferenceError: process is not defined，导致 panel.layout.Unified 渲染失败。
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env': '{}'
  },
  server: {
    port: 5173,
    strictPort: true
  },
  esbuild: {
    jsx: 'automatic'
  },
  // @pascal-app/editor 以 TS 源码分发，其裸导入的 howler 是纯 CJS(无 ESM 入口)，
  // 需强制预打包以提供具名导出(Howl/Howler)，否则 3D 编辑器加载即抛 SyntaxError。
  optimizeDeps: {
    include: ['howler']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'src'),
      'next/image': resolve(__dirname, 'src/shims/next-image.tsx'),
      'next/link': resolve(__dirname, 'src/shims/next-link.tsx')
    }
  }
}))
