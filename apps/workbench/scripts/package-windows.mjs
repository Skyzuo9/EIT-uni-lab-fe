import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { packagePortableWorkbench } from './package-portable.mjs'

export function packageWindowsWorkbench() {
  packagePortableWorkbench('win-64')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    packageWindowsWorkbench()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
