import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ARTIFACT_ROOT = resolve(
  process.cwd(),
  '../e2e-artifacts',
  'device-action-run'
)

test.describe('online device Action single run', () => {
  test('persists parameters, terminates jobs, copies complete logs and keeps the form compact', async ({
    context,
    page
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    let createdJobs = 0
    let firstJobPolls = 0
    const cancelledJobs: string[] = []

    await page.route('http://127.0.0.1:8014/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname

      if (path === '/health') {
        await route.fulfill({ json: { status: 'ok' } })
        return
      }
      if (path === '/api/v1/workflow-node-templates') {
        await route.fulfill({
          json: {
            schemaVersion: 'workflow-node-templates/v1',
            items: [
              {
                id: 'pump_1.aspirate',
                kind: 'action',
                label: '吸液',
                inputSchema: {
                  volume: { type: 'number', default: 10 }
                },
                outputSchema: {}
              },
              {
                id: 'pump_1.dispense',
                kind: 'action',
                label: '排液',
                inputSchema: {
                  volume: { type: 'number', default: 2 }
                },
                outputSchema: {}
              }
            ]
          }
        })
        return
      }
      if (path === '/api/v1/runtime/runs' && request.method() === 'POST') {
        createdJobs += 1
        await route.fulfill({
          json: {
            id: `job-${createdJobs}`,
            status: 'pending'
          }
        })
        return
      }
      if (path === '/api/v1/runtime/runs/job-1') {
        firstJobPolls += 1
        await route.fulfill({
          json: {
            id: 'job-1',
            status: firstJobPolls === 1 ? 'running' : 'failed'
          }
        })
        return
      }
      if (path === '/api/v1/runtime/runs/job-1/nodes') {
        await route.fulfill({
          json: {
            items: firstJobPolls > 1
              ? [{
                  nodeId: 'action',
                  state: 'failed',
                  result: {
                    info: ['pump started', 'pressure stable'],
                    error: 'Traceback (most recent call last):\nRuntimeError: blocked'
                  }
                }]
              : [{ nodeId: 'action', state: 'running', result: {} }]
          }
        })
        return
      }
      if (path === '/api/v1/runtime/runs/job-1/events') {
        await route.fulfill({
          json: {
            events: [
              {
                seq: 1,
                type: 'node_feedback',
                payload: { progress: 0.5 }
              }
            ],
            nextSeq: 1
          }
        })
        return
      }
      if (path === '/api/v1/runtime/runs/job-2') {
        await route.fulfill({
          json: {
            id: 'job-2',
            status: cancelledJobs.includes('job-2')
              ? 'cancelled'
              : 'running'
          }
        })
        return
      }
      if (path === '/api/v1/runtime/runs/job-2/nodes') {
        await route.fulfill({
          json: {
            items: [{
              nodeId: 'action',
              state: cancelledJobs.includes('job-2')
                ? 'cancelled'
                : 'running',
              result: cancelledJobs.includes('job-2')
                ? { info: 'cancel acknowledged' }
                : {}
            }]
          }
        })
        return
      }
      if (path === '/api/v1/runtime/runs/job-2/events') {
        await route.fulfill({
          json: { events: [], nextSeq: 0 }
        })
        return
      }
      if (
        path === '/api/v1/runtime/runs/job-2/cancel' &&
        request.method() === 'POST'
      ) {
        cancelledJobs.push('job-2')
        await route.fulfill({
          json: {
            id: 'job-2',
            status: 'cancel_requested'
          }
        })
        return
      }

      await route.fulfill({
        status: 404,
        json: { message: `Unexpected request: ${request.method()} ${path}` }
      })
    })

    await page.goto('/')

    const actionDetail = page.getByRole('main', { name: 'Action 单点运行' })
    await expect(actionDetail).toBeVisible()
    await expect(page.getByText('OS 已连接', { exact: true })).toBeVisible()
    await expect(
      actionDetail.getByRole('heading', { name: 'pump_1', exact: true })
    ).toBeVisible()

    const parameters = actionDetail.getByRole('textbox', {
      name: '动作参数 JSON'
    })
    await expect(parameters).toHaveValue('{\n  "volume": 10\n}')
    expect(await parameters.evaluate((element) =>
      element.getBoundingClientRect().height
    )).toBeLessThanOrEqual(150)

    await parameters.fill('{\n  "volume": 12\n}')
    await actionDetail.getByRole('button', { name: 'dispense' }).click()
    await expect(parameters).toHaveValue('{\n  "volume": 2\n}')
    await parameters.fill('{\n  "volume": 3\n}')
    await actionDetail.getByRole('button', { name: 'aspirate' }).click()
    await expect(parameters).toHaveValue('{\n  "volume": 12\n}')

    await actionDetail.getByRole('button', { name: '运行', exact: true }).click()
    const logs = actionDetail.getByRole('log', { name: 'Action 运行日志' })
    await expect(logs).toContainText(
      'feedback.events[0].payload.progress: 0.5'
    )
    await expect(logs).toContainText('pump started')
    await expect(logs).toContainText('pressure stable')
    await expect(logs).toContainText('Traceback (most recent call last)')
    await expect(logs).toContainText('RuntimeError: blocked')

    mkdirSync(ARTIFACT_ROOT, { recursive: true })
    await page.screenshot({
      path: resolve(ARTIFACT_ROOT, 'action-single-run.png'),
      animations: 'disabled',
      fullPage: false
    })

    await actionDetail.getByRole('button', { name: '复制', exact: true }).click()
    await expect(actionDetail.getByText('已复制', { exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('Traceback (most recent call last)')

    await actionDetail.getByRole('button', { name: '运行', exact: true }).click()
    const terminate = actionDetail.getByRole('button', {
      name: '终止',
      exact: true
    })
    await expect(terminate).toBeEnabled()
    await terminate.click()
    await expect.poll(() => cancelledJobs).toContain('job-2')
    await expect(logs).toContainText('任务状态：终止中')
    await expect(logs).toContainText('cancel acknowledged')
  })
})
