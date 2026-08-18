import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildDeviceCard } from './build'

describe('device card entry paths', () => {
  const temporaryRoots: string[] = []

  /** 清理每个测试创建的卡片项目；无参数，完成后无返回值。 */
  afterEach(async () => {
    for (const root of temporaryRoots.splice(0)) {
      await rm(root, { recursive: true, force: true })
    }
  })

  /**
   * 证明构建器能从当前操作系统的绝对项目路径加载卡片入口。
   * Windows 上该入口会是 `C:\...` 形式，不得被误判为第三方包名。
  */
  it('builds an entry resolved from a native absolute project path', async () => {
    const testRoot = resolve('.scratch')
    await mkdir(testRoot, { recursive: true })
    const projectDir = await mkdtemp(join(testRoot, 'unilab-card-build-'))
    const outDir = join(projectDir, 'dist')
    temporaryRoots.push(projectDir)
    await mkdir(join(projectDir, 'src'), { recursive: true })
    await Promise.all([
      writeFile(
        join(projectDir, 'card.manifest.json'),
        JSON.stringify({
          schemaVersion: 1,
          id: 'test.absolute-path.card',
          version: '0.1.0',
          title: '绝对路径回归卡片',
          deviceTypes: ['test.absolute-path.device'],
          sdkVersion: '^0.1.0',
          hostProtocolVersion: 1,
          authoringProfile: 'web-component-lite-v1',
          entry: 'src/index.ts',
          uiFeatures: [],
          permissions: { state: [], actions: [], media: [] }
        }),
        'utf8'
      ),
      writeFile(
        join(projectDir, 'src', 'index.ts'),
        'export default class AbsolutePathCard extends HTMLElement {}\n',
        'utf8'
      )
    ])

    const result = await buildDeviceCard({
      projectDir,
      outDir,
      development: true
    })

    expect(result.diagnostics).toEqual([])
    expect(result.ok).toBe(true)
  })
})
