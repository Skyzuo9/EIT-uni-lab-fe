import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const componentDirectory = fileURLToPath(new URL('.', import.meta.url))

describe('Workflow disabled button reasons', () => {
  /** 验证所有可能禁用的产品按钮统一使用带原因的按钮边界。 */
  it('keeps raw disabled buttons out of workflow product components', () => {
    const productComponents = readdirSync(componentDirectory)
      .filter((name) =>
        name.endsWith('.tsx') &&
        !name.endsWith('.test.tsx') &&
        name !== 'WorkflowButton.tsx'
      )

    for (const name of productComponents) {
      const source = readFileSync(`${componentDirectory}/${name}`, 'utf8')
      expect(
        source,
        `${name} 的禁用按钮必须使用 WorkflowButton 并说明原因`
      ).not.toMatch(/<button\b(?:(?!<\/button>)[\s\S])*?\bdisabled=/)
    }
  })
})
