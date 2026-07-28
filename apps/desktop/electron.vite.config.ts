import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, '../kernel-web'),
    // @pascal-app/* 以 Next.js 目标的 TS 源码分发，模块顶层直接读 process.env.*
    //（NODE_ENV / NEXT_PUBLIC_* 等），假设由 Next 在构建期替换。Electron renderer
    // 无 process 全局，故在此构建期注入 process.env：process.env.NODE_ENV 替换为当前
    // mode，其余 process.env.XXX 替换为 undefined，否则加载 3D 编辑器即抛
    // ReferenceError: process is not defined，导致 panel.layout.Unified 渲染失败。
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env': '{}'
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, '../kernel-web/src'),
        '@renderer': resolve(__dirname, '../kernel-web/src'),
        'next/image': resolve(__dirname, '../kernel-web/src/shims/next-image.tsx'),
        'next/link': resolve(__dirname, '../kernel-web/src/shims/next-link.tsx')
      }
    },
    // @pascal-app/editor 以 TS 源码分发，其裸导入的 howler 是纯 CJS(无 ESM 入口)，
    // 需强制预打包以提供具名导出(Howl/Howler)，否则 3D 编辑器加载即抛 SyntaxError。
    optimizeDeps: {
      include: ['howler']
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, '../kernel-web/index.html')
        }
      }
    },
    plugins: [tailwindcss(), react()]
  }
}))
