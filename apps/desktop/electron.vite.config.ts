import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
    resolve: {
      alias: {
        '@': resolve(__dirname, '../kernel-web/src'),
        '@renderer': resolve(__dirname, '../kernel-web/src'),
        'next/image': resolve(__dirname, '../kernel-web/src/shims/next-image.tsx'),
        'next/link': resolve(__dirname, '../kernel-web/src/shims/next-link.tsx')
      }
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
})
