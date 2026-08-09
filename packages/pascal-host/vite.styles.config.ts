import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    cssCodeSplit: true,
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/styles/source.css'),
      formats: ['es'],
      fileName: 'pascal-styles'
    },
    outDir: 'dist',
    rollupOptions: {
      output: {
        assetFileNames: 'pascal.css'
      }
    }
  }
})
