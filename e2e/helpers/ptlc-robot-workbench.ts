import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  createWriteStream,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { resolve } from 'node:path'

import { expect } from '@playwright/test'

export const artifactDirectory = process.env.UNILAB_E2E_ARTIFACT_DIR
  ?? resolve('e2e-artifacts', 'ptlc-robot-workbench-real')

export async function activateDomain(
  page: import('@playwright/test').Page,
  domain: string
): Promise<void> {
  const activity = page.locator(
    `[data-unilabdomain="${domain}"]:visible`
  ).first()
  await expect(activity).toBeVisible({ timeout: 30_000 })
  await activity.click()
}

export async function openWorkflow(
  page: import('@playwright/test').Page,
  workflowName: string
): Promise<void> {
  const workflowList = page.locator('button:visible').filter({
    hasText: /^工作流列表$/
  }).first()
  if (await workflowList.isVisible().catch(() => false)) {
    await workflowList.click()
  }
  const search = page.locator(
    'input[placeholder="搜索名称、描述或标签"]:visible'
  ).first()
  await expect(search).toBeVisible({ timeout: 60_000 })
  await search.fill(workflowName)
  await page.locator('button:visible').filter({ hasText: workflowName }).first().click()
  await expect(visibleWorkflowStartButton(page)).toBeVisible({ timeout: 60_000 })
}

export function visibleWorkflowStartButton(
  page: import('@playwright/test').Page
): import('@playwright/test').Locator {
  return page.locator('button[aria-label="开始运行"]:visible').first()
}

export function visibleWorkflowInputForm(
  page: import('@playwright/test').Page
): import('@playwright/test').Locator {
  return page.locator('[aria-label="工作流运行输入表单"]:visible').first()
}

export async function workflowTaskIds(
  backendAddress: string,
  workflowUuid: string
): Promise<Set<string>> {
  const response = await fetch(
    `${backendAddress}/api/v1/workflow-tasks?page=1&page_size=100&workflow_uuid=${workflowUuid}`
  )
  if (!response.ok) {
    throw new Error(`读取工作流任务失败：HTTP ${response.status}`)
  }
  const envelope = await response.json() as {
    data: { items: Array<{ uuid: string }> }
  }
  return new Set(envelope.data.items.map((item) => item.uuid))
}

export async function waitForNewWorkflowTask(
  backendAddress: string,
  workflowUuid: string,
  existing: ReadonlySet<string>
): Promise<string> {
  let taskUuid = ''
  await expect.poll(async () => {
    const current = await workflowTaskIds(backendAddress, workflowUuid)
    taskUuid = [...current].find((candidate) => !existing.has(candidate)) ?? ''
    return taskUuid
  }, { timeout: 30_000, intervals: [100, 250, 500] }).not.toBe('')
  return taskUuid
}

export async function workflowTaskStatus(
  backendAddress: string,
  taskUuid: string
): Promise<string> {
  const response = await fetch(
    `${backendAddress}/api/v1/workflow-tasks/${taskUuid}`
  )
  if (!response.ok) {
    throw new Error(`读取工作流任务 ${taskUuid} 失败：HTTP ${response.status}`)
  }
  const envelope = await response.json() as { data: { status: string } }
  return envelope.data.status
}

export async function captureElectronWindow(
  electronApp: import('@playwright/test').ElectronApplication,
  name: string
): Promise<void> {
  const capture = await electronApp.evaluate(async ({ BrowserWindow, webContents }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('没有可截图的 Workbench 窗口')
    const cardContents = webContents.getAllWebContents().find((candidate) =>
      candidate.getURL().startsWith('file:')
      && candidate.getURL().endsWith('/index.html')
    )
    const cardView = window.contentView.children.find((candidate) =>
      'webContents' in candidate
      && (candidate as unknown as { webContents: { id: number } }).webContents.id
        === cardContents?.id
    ) as unknown as { getBounds: () => {
      x: number; y: number; width: number; height: number
    } } | undefined
    return {
      window: (await window.capturePage()).toPNG().toString('base64'),
      card: cardContents
        ? (await cardContents.capturePage()).toPNG().toString('base64')
        : null,
      bounds: cardView?.getBounds() ?? null
    }
  })
  const outputPath = resolve(artifactDirectory, name)
  if (!capture.card || !capture.bounds) {
    writeFileSync(outputPath, Buffer.from(capture.window, 'base64'))
    return
  }
  const mainPath = resolve(artifactDirectory, `.${name}.main.png`)
  const cardPath = resolve(artifactDirectory, `.${name}.card.png`)
  writeFileSync(mainPath, Buffer.from(capture.window, 'base64'))
  writeFileSync(cardPath, Buffer.from(capture.card, 'base64'))
  try {
    execFileSync('convert', [
      mainPath,
      '(', cardPath, '-resize',
      `${capture.bounds.width}x${capture.bounds.height}!`, ')',
      '-geometry', `+${capture.bounds.x}+${capture.bounds.y}`,
      '-composite', outputPath
    ])
  } finally {
    unlinkSync(mainPath)
    unlinkSync(cardPath)
  }
}

export async function deviceCardWebContents(
  electronApp: import('@playwright/test').ElectronApplication
): Promise<{ id: number; url: string; text: string }> {
  return electronApp.evaluate(async ({ webContents }) => {
    const contents = webContents.getAllWebContents().find((candidate) =>
      candidate.getURL().startsWith('file:')
      && candidate.getURL().endsWith('/index.html')
    )
    if (!contents) throw new Error('未找到设备卡片 WebContentsView')
    const text = await contents.executeJavaScript(`(() => {
      const collect = (root) => Array.from(root.querySelectorAll('*')).flatMap((element) =>
        element.shadowRoot ? [element.shadowRoot.textContent, ...collect(element.shadowRoot)] : []
      )
      return [document.body.innerText, ...collect(document)].join('\\n')
    })()`) as string
    return { id: contents.id, url: contents.getURL(), text }
  })
}

export async function deviceCardText(
  electronApp: import('@playwright/test').ElectronApplication
): Promise<string> {
  return (await deviceCardWebContents(electronApp)).text
}

export function evidenceNamedJointValues(
  name: string,
  jointName: string
): number[] {
  const contents = readFileSync(resolve(artifactDirectory, name), 'utf8')
  const records = contents.split(/\n---\s*/)
  return records.flatMap((record) => {
    const names = record.match(/(?:^|\n)name:\s*\n((?:-\s+[^\n]+\n?)+)/)?.[1]
      ?.split('\n')
      .map((line) => line.replace(/^-\s+/, '').trim())
      .filter(Boolean) ?? []
    const arrayPositions = record.match(
      /(?:^|\n)position:\s*array\('d', \[([^\]]*)\]\)/
    )?.[1]
    const listPositions = record.match(
      /(?:^|\n)position:\s*\n((?:-\s+[^\n]+\n?)+)/
    )?.[1]
      ?.split('\n')
      .map((line) => line.replace(/^-\s+/, '').trim())
      .filter(Boolean)
    const positions = arrayPositions === undefined
      ? listPositions ?? []
      : arrayPositions.split(',').map((value) => value.trim())
    const index = names.indexOf(jointName)
    if (index < 0) return []
    const value = Number.parseFloat(positions[index] ?? '')
    return Number.isFinite(value) ? [value] : []
  })
}

export function latestEvidenceJointDegrees(
  name: string,
  jointName: string
): number {
  const radians = evidenceNamedJointValues(name, jointName).at(-1)
  return radians === undefined ? Number.NaN : radians * 180 / Math.PI
}

export async function clickDeviceCard(
  electronApp: import('@playwright/test').ElectronApplication,
  selector: string
): Promise<void> {
  await electronApp.evaluate(async ({ webContents }, cardSelector) => {
    const contents = webContents.getAllWebContents().find((candidate) =>
      candidate.getURL().startsWith('file:')
      && candidate.getURL().endsWith('/index.html')
    )
    if (!contents) throw new Error('未找到设备卡片 WebContentsView')
    await contents.executeJavaScript(`(() => {
      const deepQuery = (root, selector) => {
        const direct = root.querySelector(selector)
        if (direct) return direct
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const nested = deepQuery(element.shadowRoot, selector)
            if (nested) return nested
          }
        }
        return null
      }
      const target = deepQuery(document, ${JSON.stringify(cardSelector)})
      if (!target) throw new Error('设备卡片缺少元素：' + ${JSON.stringify(cardSelector)})
      target.click()
    })()`)
  }, selector)
}

export async function selectDeviceCardPoint(
  electronApp: import('@playwright/test').ElectronApplication,
  pointId: string
): Promise<void> {
  await electronApp.evaluate(async ({ webContents }, targetPoint) => {
    const contents = webContents.getAllWebContents().find((candidate) =>
      candidate.getURL().startsWith('file:')
      && candidate.getURL().endsWith('/index.html')
    )
    if (!contents) throw new Error('未找到设备卡片 WebContentsView')
    await contents.executeJavaScript(`(() => {
      const deepQuery = (root, selector) => {
        const direct = root.querySelector(selector)
        if (direct) return direct
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const nested = deepQuery(element.shadowRoot, selector)
            if (nested) return nested
          }
        }
        return null
      }
      const target = deepQuery(document, '[data-source-point="' + ${JSON.stringify(targetPoint)} + '"]')
      if (!target) throw new Error('设备卡片缺少点位：' + ${JSON.stringify(targetPoint)})
      target.click()
    })()`)
  }, pointId)
}

export function startEvidenceProcess(
  command: string,
  args: string[],
  name: string
): { stop: () => Promise<void> } {
  const output = createWriteStream(resolve(artifactDirectory, name))
  const child: ChildProcessWithoutNullStreams = spawn(command, args, {
    env: process.env
  })
  child.stdout.pipe(output)
  child.stderr.pipe(output)
  return {
    stop: async () => {
      if (child.exitCode === null) child.kill('SIGINT')
      await Promise.race([
        new Promise<void>(resolveClose => child.once('close', () => resolveClose())),
        new Promise<void>(resolveTimeout => setTimeout(resolveTimeout, 5_000))
      ])
      output.end()
    }
  }
}

export function readRuntimeSession(workspace: string): {
  components: { backend: { address: string } }
} {
  return JSON.parse(readFileSync(
    resolve(workspace, '.unilabos/runtime/workbench/session.json'),
    'utf8'
  )) as { components: { backend: { address: string } } }
}

export function isInvalidWorkflowSseError(message: string): boolean {
  return /workflow.*sse.*(?:无效|invalid)|(?:无效|invalid).*workflow.*sse/i.test(message)
}
