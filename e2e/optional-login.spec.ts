import { expect, test } from '@playwright/test'

test('桌面端未登录时仍可进入工作台', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      api: {
        getVersion: async () => 'e2e',
        auth: {
          getSession: async () => null,
          login: async () => null,
          logout: async () => true
        }
      }
    })
  })

  await page.goto('/')

  await expect(
    page.getByRole('navigation', { name: '主导航' })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '仪器设备' })
  ).toBeVisible()
  await expect(page.getByText('请使用 Bohrium 账号登录后继续')).toHaveCount(0)
  await expect(page.getByRole('button', {
    name: '使用 Bohrium 账号登录'
  })).toHaveCount(0)
})
