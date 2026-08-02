import { describe, expect, it, vi } from 'vitest'

interface WorkflowResourceSlotOption {
  materialUuid: string
  resourceTemplateUuid: string
  displayLabel: string
}

interface WorkflowResourceSlotOptionsPort {
  list(): Promise<readonly WorkflowResourceSlotOption[]>
}

interface ResourceSlotOptionsModule {
  filterWorkflowResourceSlotOptions(
    options: readonly WorkflowResourceSlotOption[],
    allowedResourceTemplateUuids?: readonly string[]
  ): readonly WorkflowResourceSlotOption[]
  loadWorkflowResourceSlotOptions(
    port?: WorkflowResourceSlotOptionsPort
  ): Promise<
    | { kind: 'ready'; options: readonly WorkflowResourceSlotOption[] }
    | { kind: 'unavailable' | 'error'; options: []; message: string }
  >
}

const modulePath = './workflowResourceSlotOptions'
const optionsModule = await import(/* @vite-ignore */ modulePath)
  .catch(() => ({})) as Partial<ResourceSlotOptionsModule>

const TEMPLATE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TEMPLATE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const options: readonly WorkflowResourceSlotOption[] = [
  {
    materialUuid: '11111111-1111-4111-8111-111111111111',
    resourceTemplateUuid: TEMPLATE_A,
    displayLabel: 'Sample A1'
  },
  {
    materialUuid: '22222222-2222-4222-8222-222222222222',
    resourceTemplateUuid: TEMPLATE_B,
    displayLabel: 'Sample B1'
  },
  {
    materialUuid: '33333333-3333-4333-8333-333333333333',
    resourceTemplateUuid: TEMPLATE_A,
    displayLabel: 'Sample A2'
  }
]

describe('Workflow ResourceSlot options boundary', () => {
  it('filters only by canonical resource-template identity and preserves order', () => {
    expect(optionsModule.filterWorkflowResourceSlotOptions)
      .toBeTypeOf('function')

    expect(optionsModule.filterWorkflowResourceSlotOptions!(
      options,
      [TEMPLATE_A]
    )).toEqual([options[0], options[2]])
    expect(optionsModule.filterWorkflowResourceSlotOptions!(options))
      .toEqual(options)
  })

  it('loads through the injected readonly port exactly once', async () => {
    expect(optionsModule.loadWorkflowResourceSlotOptions).toBeTypeOf('function')
    const list = vi.fn(async () => options)

    await expect(optionsModule.loadWorkflowResourceSlotOptions!({ list }))
      .resolves.toEqual({ kind: 'ready', options })
    expect(list).toHaveBeenCalledOnce()
  })

  it('fails closed with actionable state when the port is absent or rejects', async () => {
    expect(optionsModule.loadWorkflowResourceSlotOptions).toBeTypeOf('function')

    await expect(optionsModule.loadWorkflowResourceSlotOptions!())
      .resolves.toMatchObject({
        kind: 'unavailable',
        options: [],
        message: expect.stringMatching(/未注入|不可用|unavailable/i)
      })
    await expect(optionsModule.loadWorkflowResourceSlotOptions!({
      list: vi.fn(async () => {
        throw new Error('material authority offline')
      })
    })).resolves.toMatchObject({
      kind: 'error',
      options: [],
      message: expect.stringMatching(/material authority offline/i)
    })
  })
})
