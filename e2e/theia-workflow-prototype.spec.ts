import { expect, test } from '@playwright/test'

const prototypeUrl = process.env.UNILAB_THEIA_PROTOTYPE_URL

test.describe('UniLab Authoring Workbench real-system contract', () => {
  test.skip(!prototypeUrl, 'UNILAB_THEIA_PROTOTYPE_URL is required')

  test('binds the exact package source and keeps bidirectional authoring usable', async ({
    page
  }) => {
    await page.goto(prototypeUrl!)
    const workbench = page.locator('[data-package-mount-count="1"]')
    await expect(workbench).toBeVisible()
    await expect(workbench).toHaveAttribute('data-session-mode', 'simulation')
    await expect(workbench).toHaveAttribute(
      'data-workspace-graph-fingerprint',
      /^[0-9a-f]{64}$/
    )
    await expect(workbench).toHaveAttribute(
      'data-package-catalog-revision',
      /^sha256:[0-9a-f]{64}$/
    )
    await page.getByRole('button', { name: '查看 OS 日志' }).click()
    await expect(page.getByTestId('session-log-tail')).toContainText(
      '[workbench]'
    )
    await expect(page.getByText('完整控制流 DAG')).toBeVisible()
    await page.locator('.react-flow__node').first().click()
    await expect(page.locator('.monaco-editor .view-line').first()).toBeVisible()

    await expect.poll(async () => page.evaluate(() => {
      const tokens = Array.from(document.querySelectorAll(
        '.monaco-editor .view-line span'
      )).filter((element) => (
        element.children.length === 0 &&
        Boolean(element.textContent?.trim())
      ))
      return new Set(tokens.map((element) => (
        getComputedStyle(element).color
      ))).size
    })).toBeGreaterThan(1)

    const mappedCall = page.locator('.monaco-editor .view-line').filter({
      hasText: 'run_solvent_addition'
    })
    await expect(mappedCall).toBeVisible()
    await mappedCall.click()
    await expect.poll(async () => page.evaluate(() => {
      const highlighted = Array.from(document.querySelectorAll<HTMLElement>(
        '.wf-node--source-selected'
      ))
      const workflow = document.querySelector<HTMLElement>('.workflow-runtime')
      const focusColor = workflow
        ? getComputedStyle(workflow).getPropertyValue(
          '--unilab-color-focus'
        ).trim()
        : ''
      const colorProbe = document.createElement('span')
      colorProbe.style.color = focusColor
      document.body.append(colorProbe)
      const resolvedFocusColor = getComputedStyle(colorProbe).color
      colorProbe.remove()
      return {
        mappedNode: document.querySelector('[data-testid="sync-node"]')
          ?.textContent?.trim() ?? '',
        selectedNodes: highlighted.map((element) => (
          element.getAttribute('data-workflow-node-uuid')
        )),
        hasFocusBorder: highlighted.length === 1 &&
          getComputedStyle(highlighted[0]!).borderColor ===
            resolvedFocusColor
      }
    })).toEqual({
      mappedNode: 'a31553c3-8a3d-5c1c-aa16-b759faf6894e',
      selectedNodes: ['a31553c3-8a3d-5c1c-aa16-b759faf6894e'],
      hasFocusBorder: true
    })

    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '画布模式', exact: true }).click()
    await page.locator('.wf-node__id').first().click()
    await expect(page.locator('[role="dialog"]:visible')).toHaveCount(0)
    await expect(page.getByRole('complementary', {
      name: '画布节点编辑器'
    })).toBeVisible()

    const layout = await page.evaluate(() => {
      const workflow = document.querySelector<HTMLElement>('.workflow-runtime')
      const workbench = document.querySelector<HTMLElement>(
        '.persistent-authoring__workbench'
      )
      const canvas = document.querySelector<HTMLElement>(
        '.persistent-authoring__graph-stage'
      )
      const inspector = document.querySelector<HTMLElement>(
        '.persistent-authoring__node-editor'
      )
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(
        '.react-flow__node'
      )).map((element) => element.getBoundingClientRect())
      const overlaps = nodes.flatMap((left, index) => (
        nodes.slice(index + 1).filter((right) => (
          left.left < right.right &&
          left.right > right.left &&
          left.top < right.bottom &&
          left.bottom > right.top
        ))
      )).length
      const workflowRect = workflow?.getBoundingClientRect()
      const inspectorRect = inspector?.getBoundingClientRect()
      const viewport = document.querySelector<HTMLElement>(
        '.react-flow__viewport'
      )
      const transform = viewport?.style.transform.match(/scale\(([^)]+)\)/)

      return {
        workbenchHeight: workbench?.getBoundingClientRect().height ?? 0,
        canvasHeight: canvas?.getBoundingClientRect().height ?? 0,
        inspectorWithinWorkflow: !inspectorRect || Boolean(
          workflowRect && inspectorRect.right <= workflowRect.right + 1
        ),
        overlaps,
        zoom: transform ? Number(transform[1]) : 0
      }
    })

    expect(layout.workbenchHeight).toBeGreaterThan(260)
    expect(layout.canvasHeight).toBeGreaterThan(300)
    expect(layout.inspectorWithinWorkflow).toBe(true)
    expect(layout.overlaps).toBe(0)
    expect(layout.zoom).toBeGreaterThanOrEqual(0.8)
  })
})
