import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(process.cwd(), 'e2e'),
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: resolve(process.cwd(), 'packages/material/node_modules/react'),
      'react-dom': resolve(
        process.cwd(),
        'packages/material/node_modules/react-dom'
      )
    }
  },
  build: {
    outDir: resolve(process.cwd(), '../e2e-artifacts/.material-oblique-site'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(process.cwd(), 'e2e/material-oblique-fixture.html')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true
  }
})
