import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const packageRoot = dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [resolve(packageRoot, 'src/cli.ts')],
  outfile: resolve(packageRoot, 'dist/cli.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  banner: { js: '#!/usr/bin/env node' },
  external: ['esbuild', '@vue/compiler-sfc']
})
