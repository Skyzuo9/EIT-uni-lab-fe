import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('VSIX manifest boundary', () => {
  it('contains only IDE bridge commands and an explicit compatibility matrix', async () => {
    const manifest = JSON.parse(await readFile(
      new URL('../package.json', import.meta.url),
      'utf8'
    )) as {
      contributes: { commands: Array<{ command: string }> }
      unilabCompatibility: Record<string, unknown>
    }
    const commands = manifest.contributes.commands.map(item => item.command)
    expect(commands).toContain('unilab.ide.openWorkflowSource')
    expect(commands).toContain('unilab.ide.openPackageSource')
    expect(commands).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/\b(os|agent|simulator|plc|device)\b/i)
    ]))
    expect(manifest.unilabCompatibility).toEqual({
      protocolVersion: 1,
      sourceMapContract: 'unilab.workflow-source-map/v1',
      packageSourceContract: 'unilab.package-source/v1',
      minimumOsContract: 'authoring-source-map/v1'
    })
  })
})
