import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTests } from '@vscode/test-electron'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const vsix = join(appRoot, 'dist', 'unilab-authoring-0.1.0.vsix')
const fixture = join(appRoot, 'test', 'integration', 'fixture')
const extensionTestsPath = join(appRoot, 'test', 'integration', 'index.cjs')
const vscodeExecutablePath =
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code'
const tempRoot = await mkdtemp('/tmp/unilab-vsc-')
const extensionsDir = join(tempRoot, 'extensions')
const userDataDir = join(tempRoot, 'user-data')

try {
  execFileSync('/usr/local/bin/code', [
    '--extensions-dir', extensionsDir,
    '--user-data-dir', userDataDir,
    '--install-extension', vsix,
    '--force'
  ], { stdio: 'inherit' })
  const installedName = (await readdir(extensionsDir)).find(name =>
    name.startsWith('unilab.unilab-authoring-')
  )
  if (!installedName) throw new Error('VSIX did not install into the isolated host')
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: join(extensionsDir, installedName),
    extensionTestsPath,
    launchArgs: [
      fixture,
      '--user-data-dir', userDataDir,
      '--extensions-dir', extensionsDir,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-updates'
    ]
  })
  process.stdout.write('Packaged VSIX integration passed.\n')
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
