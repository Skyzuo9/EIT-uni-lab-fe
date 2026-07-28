import { resolve } from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// kernel-web 是浏览器与 Electron 共同使用的唯一 renderer。
export default defineConfig({
  plugins: [tailwindcss()],
  // @pascal-app/viewer is precompiled for Next.js and reads this value from
  // process.env. Replace only the expected public variable so browser
  // development does not require a Node process shim.
  define: {
    'process.env.NEXT_PUBLIC_ASSETS_CDN_URL': JSON.stringify(
      process.env.NEXT_PUBLIC_ASSETS_CDN_URL ?? ''
    )
  },
  server: {
    port: 5173,
    strictPort: true,
    // The shared workspace can exhaust Linux's per-user inotify instance
    // budget before Vite starts. Polling keeps local web and Electron
    // development deterministic without requiring a host-level sysctl change.
    watch: {
      usePolling: true,
      interval: 300
    }
  },
  esbuild: {
    jsx: 'automatic'
  },
  // Pascal/Radix ship precompiled ESM that imports CommonJS entries even
  // while Vite is serving the editor's workspace source in development.
  // These imports are outside the initial dependency scan, so include them
  // explicitly instead of serving their CommonJS files raw to the browser.
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
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'src'),
      'next/image': resolve(__dirname, 'src/shims/next-image.tsx'),
      'next/link': resolve(__dirname, 'src/shims/next-link.tsx')
    }
  }
})
