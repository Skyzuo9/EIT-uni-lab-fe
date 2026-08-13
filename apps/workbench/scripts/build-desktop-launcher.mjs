import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const workbenchDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const outputDirectory = path.join(workbenchDirectory, 'desktop')

await mkdir(outputDirectory, { recursive: true })
await build({
  entryPoints: [path.join(outputDirectory, 'main.mjs')],
  outfile: path.join(outputDirectory, 'main.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'original-fs'],
  sourcemap: false,
  legalComments: 'none'
})
