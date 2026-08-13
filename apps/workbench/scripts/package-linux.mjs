import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { packagePortableWorkbench } from './package-portable.mjs'

export function packageLinuxWorkbench() {
  packagePortableWorkbench('linux-64')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    packageLinuxWorkbench()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
