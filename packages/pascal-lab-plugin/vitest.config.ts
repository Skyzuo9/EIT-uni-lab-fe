import { defineConfig } from 'vitest/config'

export default defineConfig({
  ssr: {
    // Pascal's npm ESM build uses extensionless internal imports. Let Vite
    // transform it instead of handing it directly to Node's ESM loader.
    noExternal: ['@pascal-app/core']
  },
  test: {
    environment: 'node'
  }
})
