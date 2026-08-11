import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Locator, Page } from '@playwright/test'

const artifactDirectory = process.env.UNILAB_E2E_ARTIFACT_DIR

/**
 * 安装本地运行 API 与页面背景公共接口的确定性测试替身。
 *
 * @param page Playwright 页面。
 * @returns 全部初始化脚本与路由注册完成后返回。
 * @safety 仅拦截当前测试页面请求，不启动真实 Edge 或修改设备状态。
 */
export async function installLocalRuntimeTestPage(page: Page): Promise<void> {
  await installRuntimeApi(page)
  await page.route('**/health', async (route) => {
    await route.fulfill({ json: { status: 'ok' } })
  })
  await page.route('**/api/v1/devices', async (route) => {
    await route.fulfill({
      json: {
        code: 0,
        data: {
          schemaVersion: 'device-catalog/v1',
          source: 'edge',
          generatedAt: Date.now(),
          items: []
        }
      }
    })
  })
  await page.route('**/api/v1/workflow-node-templates?*', async (route) => {
    await route.fulfill({
      json: {
        code: 0,
        data: {
          authority: { authority_id: 'e2e-edge', kind: 'local' },
          catalog_fingerprint: `sha256:${'a'.repeat(64)}`,
          items: [],
          total: 0,
          page: 1,
          page_size: 100
        }
      }
    })
  })
  await page.route('**/api/v1/materials/graph', async (route) => {
    await route.fulfill({ json: { code: 0, data: { nodes: [] } } })
  })
  await page.route('**/api/v1/material-shapes', async (route) => {
    await route.fulfill({ json: { code: 0, data: { items: [] } } })
  })
  // 关闭背景物料（Material）事件流，避免界面测试访问未启动的真实 Edge。
  await page.route('**/api/v1/monitor/events?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: ''
    })
  })
}

export function isExpectedMissingDeviceSocketError(message: string): boolean {
  return message.includes(
    "WebSocket connection to 'ws://127.0.0.1:18003/api/v1/ws/device_status'"
  ) && message.includes('ERR_CONNECTION_REFUSED')
}

/**
 * 在页面加载前安装确定性的本地运行 API 测试替身。
 *
 * @param page Playwright 页面，用于注入不同日志规模和故障场景。
 * @returns 完成初始化脚本注册后结束，不返回业务数据。
 */
async function installRuntimeApi(page: Page): Promise<void> {
  /** 在浏览器上下文中按 URL 场景生成稳定的增量日志。 */
  await page.addInitScript(() => {
    let logReadCount = 0
    const hasPhoenixMissing = (): boolean => (
      new URLSearchParams(window.location.search).has('phoenixMissing')
    )
    const hasLargeLogs = (): boolean => (
      new URLSearchParams(window.location.search).has('largeLogs')
    )
    const hasLongLogs = (): boolean => (
      new URLSearchParams(window.location.search).has('longLogs')
    )
    const hasWrappedLargeLogs = (): boolean => (
      new URLSearchParams(window.location.search).has('wrappedLargeLogs')
    )
    const hasLogFilters = (): boolean => (
      new URLSearchParams(window.location.search).has('logFilters')
    )
    /** 返回当前场景是否要求 PLC-Sim 在第二次后台读取时才产生输出。 */
    const hasBackgroundPlcLogs = (): boolean => (
      new URLSearchParams(window.location.search).has('backgroundPlcLogs')
    )
    const hasLongRuntimePaths = (): boolean => (
      new URLSearchParams(window.location.search).has('longRuntimePaths')
    )
    const runtimeStatusScenario = (): string | null => (
      new URLSearchParams(window.location.search).get('runtimeStatus')
    )
    const idleSnapshot = {
      phase: 'idle' as const,
      message: 'PLC-Sim 与领域侧 Edge 均未启动',
      simulatorRunning: false,
      bridgeRunning: false,
      edgeRunning: false
    }
    const readySnapshot = {
      ...idleSnapshot,
      phase: 'ready' as const,
      message: '领域侧 Edge 已就绪',
      edgeRunning: true
    }
    /**
     * 按浏览器场景生成 PLC-Sim 与领域侧 Edge 的独立进程状态快照。
     *
     * @returns 命中四种状态场景时返回快照，否则返回 null 继续使用普通夹具。
     * @throws 不抛出异常；未知查询值按未配置场景处理。
     */
    const scenarioSnapshot = () => {
      const scenario = runtimeStatusScenario()
      if (scenario === 'plc') {
        return {
          ...idleSnapshot,
          phase: 'simulator_ready' as const,
          message: 'PLC-Sim 运行中；领域侧 Edge 未启动',
          simulatorRunning: true
        }
      }
      if (scenario === 'edge') {
        return readySnapshot
      }
      if (scenario === 'both') {
        return {
          ...readySnapshot,
          message: 'PLC-Sim 与领域侧 Edge 已就绪',
          simulatorRunning: true,
          bridgeRunning: true
        }
      }
      return scenario === 'idle' ? idleSnapshot : null
    }
    // 该计数只描述 PLC-Sim 日志来源的读取次数，用于构造确定性的后台更新。
    let simulatorLogReadCount = 0
    const runtimeApi = {
      selectPath: async () => null,
      getDefaultEnvironmentPath: async () => hasLongRuntimePaths()
        ? '/tmp/a-very-long-workspace-name/conda/environments/unilab-runtime-with-a-long-name'
        : '/tmp/envs/unilab',
      getSnapshot: async () => scenarioSnapshot()
        ?? (hasPhoenixMissing() ? readySnapshot : idleSnapshot),
      getModeInfo: async () => ({
        mode: 'development' as const,
        label: '开发环境 Runtime',
        runtimeVersion: null
      }),
      inspectDevicePackage: async () => ({
        workspacePath: '/tmp/szlab',
        contentHash: `sha256:${'b'.repeat(64)}`,
        signatureStatus: 'valid' as const,
        signerFingerprint: 'e2e',
        trusted: true,
        confirmationRequired: false
      }),
      confirmDevicePackage: async () => ({
        workspacePath: '/tmp/szlab',
        contentHash: `sha256:${'b'.repeat(64)}`,
        signatureStatus: 'valid' as const,
        signerFingerprint: 'e2e',
        trusted: true,
        confirmationRequired: false
      }),
      startSimulator: async () => idleSnapshot,
      stopSimulator: async () => idleSnapshot,
      startEdge: async () => idleSnapshot,
      stopEdge: async () => idleSnapshot,
      runAcceptance: async () => idleSnapshot,
      readLogs: async () => {
        logReadCount += 1
        const edgeLines = Array.from(
          { length: 80 + logReadCount * 4 },
          (_, index) => `26-08-04 [12:00:${String(index).padStart(2, '0')}] [INFO] edge line ${index}`
        )
        if (hasPhoenixMissing()) {
          edgeLines.unshift(
            '[launcher] 2026-08-04T03:12:00.000Z starting',
            '26-08-04 [11:12:02,100] [ERROR] Phoenix trace 日志服务启动失败：未安装 Arize Phoenix',
            'POST /api/v1/observability/otlp/v1/traces HTTP/1.1 503 Service Unavailable',
            'POST /api/v1/observability/otlp/v1/traces HTTP/1.1 503 Service Unavailable'
          )
        }
        edgeLines.push('latest edge output')
        return {
          readAt: Date.now(),
          entries: [
            {
              kind: 'simulator' as const,
              content: 'OPC UA ready',
              available: true,
              truncated: false
            },
            {
              kind: 'bridge' as const,
              content: 'Edge service ready',
              available: true,
              truncated: false
            },
            {
              kind: 'edge' as const,
              content: edgeLines.join('\n'),
              available: true,
              truncated: false
            }
          ]
        }
      },
      /** 按固定来源返回当前日志增量，并为后台 PLC-Sim 场景推进只读快照。 */
      readLog: async (query: {
        kind: 'simulator' | 'bridge' | 'edge'
        cursor: { fileId: string; offset: number } | null
      }) => {
        logReadCount += 1
        if (query.kind === 'simulator') simulatorLogReadCount += 1
        const initial = query.cursor === null
        const lineCount = initial
          ? (hasLargeLogs() || hasWrappedLargeLogs() ? 2_600 : 84)
          : 4
        const start = initial ? 0 : query.cursor?.offset ?? 0
        const lines = Array.from(
          { length: lineCount },
          (_, index) => hasWrappedLargeLogs()
            ? (
                `26-08-04 [12:00:${String(start + index).padStart(2, '0')}] `
                + '[INFO] uvicorn.protocols.http.httptools_impl '
                + `[Uvicorn.HTTP] 127.0.0.1:64278 - "GET /api/v1/`
                + 'workflow-node-templates/'
                + `${String(start + index).padStart(4, '0')}-`
                + '425ac1b3-2457-4724-b04f-369a362992f3 '
                + 'HTTP/1.1" 200'
              )
            : (
                `26-08-04 [12:00:${String(start + index).padStart(2, '0')}] `
                + `[INFO] ${query.kind} line ${start + index}`
              )
        )
        if (query.kind === 'edge' && hasLogFilters()) {
          if (initial) {
            lines.splice(
              0,
              lines.length,
              '2026-08-04 12:01:30.000 | INFO | worker - worker ready',
              '2026-08-04 12:01:31.000 | ERROR | worker - Action failed',
              'Traceback (most recent call last):',
              '  File "worker.py", line 18, in run',
              'ValueError: invalid volume'
            )
          } else {
            lines.splice(
              0,
              lines.length,
              `2026-08-04 12:01:${String(logReadCount).padStart(2, '0')}.000 | ERROR | worker - incremental failure ${logReadCount}`
            )
          }
        }
        if (initial && query.kind === 'edge' && hasPhoenixMissing()) {
          lines.unshift(
            '[launcher] 2026-08-04T03:12:00.000Z starting',
            '26-08-04 [11:12:02,100] [ERROR] Phoenix trace 日志服务启动失败：未安装 Arize Phoenix',
            'POST /api/v1/observability/otlp/v1/traces HTTP/1.1 503 Service Unavailable'
          )
        }
        if (initial && query.kind === 'edge' && hasLongLogs()) {
          lines.push(
            '2026-08-04 12:01:30.000 | ERROR | '
            + 'unilabos.drivers.powder_feeder.material_flow - '
            + '粉末投料执行失败：设备返回的诊断详情包含多个寄存器状态、'
            + '请求参数与恢复建议，需要在日志抽屉中完整展示，不能使用省略号隐藏。'
            + '寄存器状态=' + 'A1B2C3D4'.repeat(20)
            + ' 完整日志末尾-UNILAB'
          )
        }
        if (query.kind === 'simulator' && hasBackgroundPlcLogs()) {
          if (simulatorLogReadCount === 1) {
            return {
              kind: query.kind,
              content: '',
              available: false,
              truncated: false,
              readAt: Date.now(),
              cursor: { fileId: 'e2e-simulator', offset: 0 },
              reset: true
            }
          }
          lines.splice(0, lines.length, 'PLC-Sim 后台新增输出')
        }
        if (query.kind === 'edge') lines.push('latest edge output')
        const offset = start + lineCount
        return {
          kind: query.kind,
          content: `${lines.join('\n')}\n`,
          available: true,
          truncated: false,
          readAt: Date.now(),
          cursor: { fileId: `e2e-${query.kind}`, offset },
          reset: initial
        }
      },
      openLogFile: async () => ({ opened: true }),
      onSnapshot: () => () => undefined
    }
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { runtime: runtimeApi }
    })
  })
}

/** 返回窗口化列表声明的逻辑总行数，而不是当前挂载的 DOM 行数。 */
export async function logRowSetSize(logOutput: Locator): Promise<number> {
  const value = await logOutput.getByRole('listitem').first()
    .getAttribute('aria-setsize')
  return Number(value ?? 0)
}

/**
 * 读取单个本地进程状态区域的最终背景色和文字色。
 *
 * @param processState PLC-Sim 或领域侧 Edge 的状态区域定位器。
 * @returns 浏览器计算后的不透明背景色与前景色。
 * @throws 元素不存在或浏览器求值失败时透传 Playwright 异常。
 */
export async function processVisualStyle(processState: Locator): Promise<{
  background: string
  color: string
}> {
  return processState.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      background: style.backgroundColor,
      color: style.color
    }
  })
}

export async function capture(page: Page, name: string): Promise<void> {
  if (!artifactDirectory) return
  mkdirSync(artifactDirectory, { recursive: true })
  await page.screenshot({
    path: resolve(artifactDirectory, name),
    fullPage: true
  })
}

export async function captureLocator(
  locator: Locator,
  name: string
): Promise<void> {
  if (!artifactDirectory) return
  mkdirSync(artifactDirectory, { recursive: true })
  await locator.screenshot({
    path: resolve(artifactDirectory, name)
  })
}
