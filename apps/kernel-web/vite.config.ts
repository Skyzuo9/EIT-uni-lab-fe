import { resolve } from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// kernel-web 是浏览器与 Electron 共同使用的唯一 renderer。
export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    strictPort: true
  },
  esbuild: {
    jsx: 'automatic'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'src'),
      'next/image': resolve(__dirname, 'src/shims/next-image.tsx'),
      'next/link': resolve(__dirname, 'src/shims/next-link.tsx')
    }
  }
})
