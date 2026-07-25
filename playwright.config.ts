import { defineConfig } from '@playwright/test'

const baseURL =
  process.env.UNILAB_FE_E2E_URL || 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL,
    headless: process.env.UNILAB_E2E_HEADED !== '1',
    viewport: { width: 1680, height: 1050 },
    colorScheme: 'light',
    locale: 'zh-CN',
    trace: 'retain-on-failure'
  },
  webServer: process.env.UNILAB_FE_E2E_URL
    ? undefined
    : {
        command:
          'pnpm build:web && pnpm --filter @unilab/kernel-web preview --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000
      },
  reporter: [['list']]
})
