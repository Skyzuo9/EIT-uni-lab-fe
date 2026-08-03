import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

const environmentPath = process.env.UNILAB_E2E_CONDA_ENV ?? ''
const osProjectPath = process.env.UNILAB_E2E_OS_ROOT ?? ''
const domainProjectPath = process.env.UNILAB_E2E_DOMAIN_ROOT ?? ''
const graphPath = process.env.UNILAB_E2E_GRAPH_PATH ?? ''
const artifactDirectory = process.env.UNILAB_E2E_ARTIFACT_DIR
  ?? resolve('e2e-artifacts', 'local-debugger-real-edge')

test.skip(
  !environmentPath || !osProjectPath || !domainProjectPath || !graphPath,
  '需要 UNILAB_E2E_CONDA_ENV、UNILAB_E2E_OS_ROOT、UNILAB_E2E_DOMAIN_ROOT 和 UNILAB_E2E_GRAPH_PATH'
)

test('starts a real Edge from the desktop local debugger', async () => {
  test.setTimeout(180_000)
  mkdirSync(artifactDirectory, { recursive: true })

  const electronApp = await electron.launch({
    args: [resolve('apps/desktop/out/main/index.js')],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      UNILABOS_TRACE_ENABLED: '0',
      XDG_CONFIG_HOME: resolve(artifactDirectory, 'electron-config')
    }
  })

  try {
    const page = await electronApp.firstWindow()
    await expect(page.getByRole('group', { name: 'Edge 连接配置' }))
      .toBeVisible()
    await capture(page, '01-frontend-started.png')

    await page.evaluate((config) => {
      globalThis.localStorage.setItem(
        'unilab.local-runtime-launch-config.v2',
        JSON.stringify(config)
      )
    }, {
      graphPath,
      osProjectPath,
      szlabProjectPath: domainProjectPath,
      environmentPath,
      simulatorProjectPath: ''
    })
    await page.reload()

    const connectionBar = page.getByRole('group', {
      name: 'Edge 连接配置'
    })
    await connectionBar.getByRole('button', {
      name: '启动本地环境'
    }).click()
    const runtimeDialog = page.getByRole('dialog', {
      name: '启动领域侧本地调试环境（以 sz_lab 为例）'
    })
    await expect(runtimeDialog).toBeVisible()
    await expect(runtimeDialog.getByRole('textbox', {
      name: '领域项目根目录（以 Uni-Lab-SZLab 为例）'
    })).toHaveValue(domainProjectPath)
    await capture(page, '02-domain-debugger-configured.png')

    await runtimeDialog.getByRole('button', { name: '启动 Edge' }).click()
    await expect(runtimeDialog.getByRole('status')).toContainText(
      /正在检查|正在通过 unilab CLI|正在初始化|正在等待/,
      { timeout: 30_000 }
    )
    await capture(page, '03-edge-starting.png')

    await expect(runtimeDialog.getByRole('status')).toContainText(
      '领域侧 Edge 已就绪',
      { timeout: 120_000 }
    )
    await expect(runtimeDialog.getByText('运行中', { exact: true }))
      .toHaveCount(1)
    await capture(page, '04-edge-ready.png')

    const healthResponse = await fetch(
      'http://127.0.0.1:18003/api/v1/health'
    )
    expect(healthResponse.ok).toBe(true)
    const healthPayload: unknown = await healthResponse.json()
    expect(healthPayload).toMatchObject({ status: 'ok' })
    writeFileSync(
      resolve(artifactDirectory, 'edge-health.json'),
      `${JSON.stringify(healthPayload, null, 2)}\n`
    )
    await capture(page, '05-edge-health-confirmed.png')

    await runtimeDialog.getByRole('button', { name: '查看日志' }).click()
    const logDrawer = page.getByRole('dialog', { name: '本地运行日志' })
    await expect(logDrawer).toBeVisible()
    await logDrawer.getByRole('tab', { name: /Edge 运行时/ }).click()
    await expect(logDrawer.getByRole('tabpanel')).not.toContainText(
      '尚未生成日志'
    )
    await capture(page, '06-edge-runtime-log.png')
    await page.keyboard.press('Escape')

    await runtimeDialog.getByRole('button', { name: '停止 Edge' }).click()
    await expect(runtimeDialog.getByRole('status')).toContainText(
      'PLC-Sim 与领域侧 Edge 均未启动',
      { timeout: 30_000 }
    )
    await capture(page, '07-edge-stopped.png')
  } finally {
    await electronApp.close()
  }
})

async function capture(
  page: import('@playwright/test').Page,
  name: string
): Promise<void> {
  await page.screenshot({
    path: resolve(artifactDirectory, name),
    fullPage: true
  })
}
