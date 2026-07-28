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
    server: {
      watch: {
        usePolling: true,
        interval: 300
      }
    },
    define: {
      'process.env.NEXT_PUBLIC_ASSETS_CDN_URL': JSON.stringify(
        process.env.NEXT_PUBLIC_ASSETS_CDN_URL ?? ''
      )
    },
    // Keep Electron development aligned with kernel-web's Vite server.
    // Pascal's workspace source imports these CommonJS entries directly.
    optimizeDeps: {
      include: [
        'react/jsx-runtime',
        'react-dom',
        '@unilab/pascal-lab-plugin > @unilab/pascal-host > @pascal-app/editor > howler'
      ],
      esbuildOptions: {
        define: {
          'process.env.NEXT_PUBLIC_ASSETS_CDN_URL': JSON.stringify(
            process.env.NEXT_PUBLIC_ASSETS_CDN_URL ?? ''
          )
        }
      }
    },
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
