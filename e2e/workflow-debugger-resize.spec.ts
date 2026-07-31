import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { startOfflineLocalBridge } from './helpers/offline-local-bridge'

test('工作流调试区域支持拖拽、键盘调整并在模块切换后保留高度', async ({
  page
}) => {
  const profilePath = resolve(
    process.cwd(),
    'e2e/fixtures/host-node-test-latency/profile.yaml'
  )
  const bridge = await startOfflineLocalBridge(0, [profilePath])

  try {
    await page.setViewportSize({ width: 900, height: 900 })
    await page.goto(`/?localOsUrl=${encodeURIComponent(bridge.url)}`)
    await page.getByText('工作流', { exact: true }).first().click()

    const dock = page.locator('[data-workflow-debug-dock]')
    const separator = page.getByRole('separator', {
      name: '调整工作流调试区域高度'
    })
    await expect(dock).toBeVisible()
    await expect(separator).toBeVisible()

    const initialBox = await dock.boundingBox()
    expect(initialBox).not.toBeNull()
    await separator.focus()
    await page.keyboard.press('ArrowUp')
    const keyboardBox = await dock.boundingBox()
    expect(keyboardBox).not.toBeNull()
    expect(keyboardBox!.height).toBeGreaterThan(
      initialBox!.height + 10
    )

    const separatorBox = await separator.boundingBox()
    expect(separatorBox).not.toBeNull()
    await page.mouse.move(
      separatorBox!.x + separatorBox!.width / 2,
      separatorBox!.y + separatorBox!.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(
      separatorBox!.x + separatorBox!.width / 2,
      separatorBox!.y - 48,
      { steps: 4 }
    )
    await page.mouse.up()

    const draggedBox = await dock.boundingBox()
    expect(draggedBox).not.toBeNull()
    expect(draggedBox!.height).toBeGreaterThan(
      keyboardBox!.height + 35
    )
    await expect(page.locator('.workflow-runtime__canvas')).toHaveCSS(
      'min-height',
      '260px'
    )

    await page.getByText('仪器设备', { exact: true }).first().click()
    await page.getByText('工作流', { exact: true }).first().click()
    const restoredBox = await dock.boundingBox()
    expect(restoredBox).not.toBeNull()
    expect(Math.abs(restoredBox!.height - draggedBox!.height))
      .toBeLessThanOrEqual(1)

    await page.setViewportSize({ width: 900, height: 760 })
    await expect.poll(async () => {
      return (await dock.boundingBox())?.height ?? 0
    }).toBeLessThan(restoredBox!.height)
    const constrainedCanvasBox = await page
      .locator('.workflow-runtime__canvas')
      .boundingBox()
    expect(constrainedCanvasBox).not.toBeNull()
    expect(constrainedCanvasBox!.height).toBeGreaterThanOrEqual(259)

    await page.setViewportSize({ width: 900, height: 900 })
    await expect.poll(async () => {
      return (await dock.boundingBox())?.height ?? 0
    }).toBeCloseTo(restoredBox!.height, 0)

    mkdirSync(resolve(process.cwd(), '../e2e-artifacts'), {
      recursive: true
    })
    await page.screenshot({
      path: resolve(
        process.cwd(),
        '../e2e-artifacts/workflow-debugger-resize.png'
      ),
      fullPage: true
    })

    await separator.dblclick()
    const resetBox = await dock.boundingBox()
    expect(resetBox).not.toBeNull()
    expect(resetBox!.height).toBeLessThan(draggedBox!.height)

    await page.getByRole('button', {
      name: '收起运行输出'
    }).click()
    await expect(separator).toHaveCount(0)
    const collapsedBox = await dock.boundingBox()
    expect(collapsedBox).not.toBeNull()
    expect(collapsedBox!.height).toBeLessThan(resetBox!.height)
  } finally {
    await bridge.stop()
  }
})
