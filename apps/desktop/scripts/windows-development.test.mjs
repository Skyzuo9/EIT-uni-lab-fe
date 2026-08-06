import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { pnpmInvocation } from '../../../scripts/platform-process.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * 读取工作区包清单，验证 Windows 桌面开发入口不会依赖 POSIX shell 语法。
 *
 * @param {string} relativePath 相对仓库根目录的 package.json 路径。
 * @returns {Promise<Record<string, unknown>>} 解析后的包清单。
 */
async function readPackageManifest(relativePath) {
  return JSON.parse(await readFile(resolve(repositoryRoot, relativePath), 'utf8'))
}

describe('Windows desktop development scripts', () => {
  /** 验证 Windows 使用当前 Node 解释器执行 pnpm CLI，保留含空格路径。 */
  it('resolves pnpm without relying on a cmd shim', () => {
    const invocation = pnpmInvocation(
      ['build:web'],
      { npm_execpath: 'C:\\Program Files\\pnpm\\pnpm.cjs' },
      'win32'
    )

    expect(invocation).toEqual({
      command: process.execPath,
      args: ['C:\\Program Files\\pnpm\\pnpm.cjs', 'build:web']
    })
  })

  /** 验证两个 CLI 都通过 Node API 构建，避免 CMD 拆分带空格的 shebang。 */
  it('uses Node build entrypoints instead of shell-quoted esbuild arguments', async () => {
    const agentCli = await readPackageManifest(
      'packages/device-card-agent-cli/package.json'
    )
    const tooling = await readPackageManifest(
      'packages/device-card-tooling/package.json'
    )

    expect(agentCli.scripts.build).toBe('node build.mjs')
    expect(tooling.scripts.build).toBe(
      'pnpm --filter @unilab/device-card-builder build && node build.mjs'
    )
  })

  /** 验证桌面开发入口可在清除 Electron Node 模式后定位并运行 CLI。 */
  it('starts electron-vite through a cross-platform Node launcher', async () => {
    const desktop = await readPackageManifest('apps/desktop/package.json')
    const launcher = resolve(
      repositoryRoot,
      'apps/desktop/scripts/run-electron-vite.mjs'
    )

    expect(desktop.scripts.dev).toBe('node scripts/run-electron-vite.mjs dev')
    expect(desktop.scripts.preview).toBe(
      'node scripts/run-electron-vite.mjs preview'
    )

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [launcher, '--help'],
      {
        cwd: resolve(repositoryRoot, 'apps/desktop'),
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      }
    )

    expect(`${stdout}\n${stderr}`).toContain('electron-vite')
  })

  /** 验证根 E2E 入口不依赖 POSIX 环境赋值或只能在 Linux 使用的 xvfb 命令。 */
  it('uses the cross-platform Playwright launcher for fixture scripts', async () => {
    const root = await readPackageManifest('package.json')
    const scripts = root.scripts
    const fixtureScripts = [
      scripts['test:e2e:material-create'],
      scripts['test:e2e:material-oblique'],
      scripts['test:e2e:materials'],
      scripts['test:e2e:desktop-local-runtime']
    ]

    for (const script of fixtureScripts) {
      expect(script).toMatch(/^node scripts\/run-playwright-e2e\.mjs /)
      expect(script).not.toMatch(/^[A-Z][A-Z0-9_]*=/)
      expect(script).not.toContain('xvfb-run')
    }
  })

  /** 验证自建预览门禁通过共享 Windows 进程适配器启动 pnpm。 */
  it('routes preview gates through the cross-platform process helper', async () => {
    for (const relativePath of [
      'scripts/run-f06-composite-e2e.mjs',
      'scripts/run-f07-task-input-e2e.mjs'
    ]) {
      const source = await readFile(resolve(repositoryRoot, relativePath), 'utf8')
      expect(source).toContain("from './platform-process.mjs'")
      expect(source).not.toContain("process.kill(-")
      expect(source).not.toContain("'pnpm',")
    }
  })
})
