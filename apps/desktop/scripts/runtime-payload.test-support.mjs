import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Create the smallest packaged Runtime and reference Workspace accepted by the publication gate. */
export function createPackagedRuntimeFixture(resourcesDirectory, platform) {
  const runtimeDirectory = join(resourcesDirectory, 'runtime-installer')
  const installerFile = platform === 'win-64'
    ? 'Uni-Lab-OS-fixture-win-64.exe'
    : `Uni-Lab-OS-fixture-${platform}.sh`
  const installer = Buffer.from(`fixture-runtime-${platform}`)
  mkdirSync(runtimeDirectory, { recursive: true })
  writeFileSync(join(runtimeDirectory, installerFile), installer)
  writeFileSync(join(runtimeDirectory, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    runtimeVersion: '0.1.0-test',
    platform,
    installerFile,
    sha256: createHash('sha256').update(installer).digest('hex')
  }))

  const workspaceDirectory = join(resourcesDirectory, 'default-workspace')
  const files = {
    'package.yaml': 'package:\n  name: bundled-reference\n',
    'deployment/local_config.py': '',
    'deployment/graphs/device.json': '{}\n',
    'unilab.acceptance.json': '{}\n'
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(workspaceDirectory, relativePath)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
}
