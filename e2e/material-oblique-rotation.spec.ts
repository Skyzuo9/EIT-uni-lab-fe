import { expect, test } from '@playwright/test'

/**
 * 验证用户在独立物料（Material）2.5D 画布横向拖拽后得到非零视角。
 * 输入为真实指针拖拽，输出通过公开相机状态属性断言。
 */
test('2.5D 视图支持拖拽旋转', async ({ page }) => {
  await page.goto('/material-oblique-fixture.html')

  const oblique = page.locator('[data-material-oblique-view]')
  await expect(oblique).toBeVisible()
  await expect(oblique).toHaveAttribute('data-camera-rotation', '0.00')
  await page.getByRole('button', {
    name: '向右旋转 2.5D 视图'
  }).click()
  await expect(oblique).toHaveAttribute('data-camera-rotation', '15.00')
  await page.getByRole('button', {
    name: '向左旋转 2.5D 视图'
  }).click()
  await expect(oblique).toHaveAttribute('data-camera-rotation', '0.00')

  await page.getByRole('button', { name: '放大 2.5D 视图' }).click()
  await expect(oblique).toHaveAttribute('data-camera-zoom', '1.25')
  const obliqueBounds = await oblique.boundingBox()
  expect(obliqueBounds).not.toBeNull()
  if (!obliqueBounds) throw new Error('2.5D 视图缺少可交互区域')

  await page.mouse.move(
    obliqueBounds.x + obliqueBounds.width / 2,
    obliqueBounds.y + obliqueBounds.height / 2
  )
  const svg = page.getByRole('group', { name: '实验室 2.5D 物料视图' })
  const viewBoxBeforePan = await svg.getAttribute('viewBox')
  await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(
    obliqueBounds.x + obliqueBounds.width / 2 + 40,
    obliqueBounds.y + obliqueBounds.height / 2 + 60,
    { steps: 4 }
  )
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(oblique).toHaveAttribute('data-camera-rotation', '0.00')
  await expect.poll(() => svg.getAttribute('viewBox')).not.toBe(
    viewBoxBeforePan
  )

  await page.getByRole('button', { name: '适应全部物料' }).click()
  await expect(oblique).toHaveAttribute('data-camera-zoom', '1.00')
  await page.mouse.move(
    obliqueBounds.x + obliqueBounds.width / 2,
    obliqueBounds.y + obliqueBounds.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    obliqueBounds.x + obliqueBounds.width / 2 + 120,
    obliqueBounds.y + obliqueBounds.height / 2,
    { steps: 6 }
  )
  await page.mouse.up()

  await expect(oblique).toHaveAttribute(
    'data-camera-rotation',
    /-?(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)/
  )
})
