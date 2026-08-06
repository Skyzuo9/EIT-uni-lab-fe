import { createServer, type Server } from 'node:http'
import { mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

const artifactDirectory = resolve('e2e-artifacts', 'device-square-electron')
const templateUuid = '50afbb58-0f53-4ad6-9f73-24cfeb90a834'
const artifactDigest = `sha256:${'a'.repeat(64)}`
const catalogDigest = `sha256:${'b'.repeat(64)}`

/** 验证 Electron 通过 Main 读取现有云端接口并渲染设备接入操作台。 */
test('browses the cloud device square through Electron Main', async () => {
  test.setTimeout(60_000)
  mkdirSync(artifactDirectory, { recursive: true })
  const server = await startDeviceSquareServer()
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试 Backend 端口不可用')
  const configDirectory = resolve(artifactDirectory, 'electron-config')
  await rm(configDirectory, { recursive: true, force: true })
  const electronApp = await electron.launch({
    args: ['--no-sandbox', resolve('apps/desktop/out/main/index.js')],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: '',
      PC_CLIENT_API_URL: `http://127.0.0.1:${address.port}/api/v1`,
      UNILABOS_TRACE_ENABLED: '0',
      XDG_CONFIG_HOME: configDirectory
    }
  })

  try {
    const page = await electronApp.firstWindow()
    const browserErrors: string[] = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })

    await page.getByRole('button', { name: '设备广场' }).click()
    await expect(page.getByRole('heading', { name: '设备广场与本地接入' }))
      .toBeVisible()
    await page.waitForTimeout(1_000)
    await page.screenshot({
      path: resolve(artifactDirectory, 'device-square-loading.png'),
      fullPage: true
    })
    await expect(page.getByRole('heading', { name: '测试蠕动泵' })).toBeVisible()
    await expect(page.getByRole('button', { name: '添加心愿单并接入本地' }))
      .toBeVisible()
    await page.screenshot({
      path: resolve(artifactDirectory, 'device-square-desktop.png'),
      fullPage: true
    })

    await page.getByRole('button', { name: '上传设备包' }).click()
    await expect(page.getByRole('heading', { name: '检查 Package Workspace' }))
      .toBeVisible()
    await page.screenshot({
      path: resolve(artifactDirectory, 'device-package-upload-desktop.png'),
      fullPage: true
    })

    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window?.setSize(720, 780)
    })
    await page.getByRole('button', { name: '云端设备广场' }).click()
    await expect(page.getByRole('heading', { name: '测试蠕动泵' })).toBeVisible()
    await page.screenshot({
      path: resolve(artifactDirectory, 'device-square-compact.png'),
      fullPage: true
    })
    expect(browserErrors).toEqual([])
  } finally {
    await electronApp.close()
    await closeServer(server)
  }
})

/** 启动只实现既有广场 list/detail 的本地兼容 Backend。 */
async function startDeviceSquareServer(): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    response.setHeader('content-type', 'application/json; charset=utf-8')
    if (url.pathname === '/api/v1/lab/square/list') {
      response.end(JSON.stringify({
        code: 0,
        data: {
          total: 1,
          page: 1,
          page_size: 40,
          data: [deviceSummary()]
        }
      }))
      return
    }
    if (url.pathname === `/api/v1/lab/square/detail/${templateUuid}`) {
      response.end(JSON.stringify({
        code: 0,
        data: {
          ...deviceSummary(),
          model: { model: 'UL-PUMP-01' },
          device_params: { interface: 'serial' },
          package_info: {
            name: 'review-lab',
            version: '1.2.0',
            class_namespace: 'community.review_lab',
            artifact_digest: artifactDigest,
            catalog_digest: catalogDigest
          },
          source_registry: { source_fqid: 'community.review_lab.pump' },
          effective_template: {}
        }
      }))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ message: 'not found' }))
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => resolveListen())
  })
  return server
}

/** 生成 list/detail 共用的现有 Backend 设备模板字段。 */
function deviceSummary(): Record<string, unknown> {
  return {
    uuid: templateUuid,
    name: 'test-pump',
    display_name: '测试蠕动泵',
    cover: '',
    icon: '',
    description: '用于验证云端设备包下载、本地配置与 Action 接入闭环。',
    tags: ['液体处理', '串口'],
    resource_type: 'device',
    created_at: '2026-08-05T00:00:00.000Z',
    manufacturer: {
      uuid: 'maker-1',
      name: 'Uni-Lab 测试设备',
      code: 'UL',
      website: ''
    }
  }
}

/** 关闭本地兼容 Backend 并等待监听句柄释放。 */
async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose())
  })
}
