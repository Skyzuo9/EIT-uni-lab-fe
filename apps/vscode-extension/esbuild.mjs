import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir(new URL('./dist/', import.meta.url), { recursive: true })
await build({
  entryPoints: [new URL('./src/extension.ts', import.meta.url).pathname],
  outfile: new URL('./dist/extension.cjs', import.meta.url).pathname,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  sourcesContent: false,
  logLevel: 'info'
})
