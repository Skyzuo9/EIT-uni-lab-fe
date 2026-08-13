import { describe, expect, it, vi } from 'vitest'

import { getDefaultBackend } from './backends'
import { createInventoryReadPort } from './inventory'
import type { HttpClient } from './http'

describe('inventory read port', () => {
  /** 证明 OS 快照只投影明确的试剂批次，并保留权威可用量和预留量。 */
  it('maps reagent lots from the real OS inventory snapshot', async () => {
    const request = vi.fn(async () => ({
      templates: [
        { template_id: 'reagent-naoh', name: 'NaOH 1M', category: 'reagent' },
        { template_id: 'tips', name: '吸头', category: 'consumable' }
      ],
      lots: [
        {
          lot_id: 'lot-naoh', template_id: 'reagent-naoh', batch_no: 'B-01',
          unit: 'mL', quantity_total: 500, quantity_available: 420,
          quantity_reserved: 80, expiry: '2027-01-01', quarantined: 0,
          warehouse_zone_id: 'zone-a'
        },
        {
          lot_id: 'lot-tips', template_id: 'tips', batch_no: 'T-01',
          unit: 'piece', quantity_total: 96, quantity_available: 96,
          quantity_reserved: 0, expiry: '', quarantined: 0,
          warehouse_zone_id: 'zone-b'
        }
      ]
    }))
    const port = createInventoryReadPort(
      { request } as HttpClient,
      getDefaultBackend('local-python')
    )

    await expect(port.listReagentInventory()).resolves.toEqual([{
      id: 'lot-naoh',
      templateId: 'reagent-naoh',
      name: 'NaOH 1M',
      totalQuantity: 500,
      availableQuantity: 420,
      reservedQuantity: 80,
      unit: 'mL',
      lotLabel: 'B-01',
      siteLabel: 'zone-a',
      expiresAt: '2027-01-01',
      status: 'available'
    }])
  })

  /** 证明 Backend 未返回预留维度时保持未知，不由前端伪造为零。 */
  it('keeps missing Backend reservation quantities unknown', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      data: {
        items: [{
          uuid: 'reagent-1', material_uuid: 'material-1',
          reagent_info_uuid: 'info-1', revision: 3, meta_data: {}, name: '乙腈',
          cas: '75-05-8', molecular_formula: 'C2H3N', physical_state: 'liquid',
          quantity: 12.5, quantity_unit: 'mL', container_barcode: 'BOT-01',
          container_name: '乙腈瓶'
        }]
      }
    }))
    const port = createInventoryReadPort(
      { request } as HttpClient,
      getDefaultBackend('local-go')
    )

    const [item] = await port.listReagentInventory()
    expect(item).toMatchObject({
      id: 'reagent-1',
      materialId: 'material-1',
      name: '乙腈',
      totalQuantity: 12.5,
      status: 'available'
    })
    expect(item.availableQuantity).toBeUndefined()
    expect(item.reservedQuantity).toBeUndefined()
  })

  /** 证明 Go Backend 试剂创建、乐观更新和软删除都使用正式 CRUD 路由。 */
  it('writes Backend reagents through the verified CRUD contract', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/reagents' && init?.method === 'POST') {
        return { code: 0, data: { uuid: 'reagent-new', revision: 1 } }
      }
      if (path === '/api/v1/reagents/reagent-new' && init?.method === 'PUT') {
        return { code: 0, data: { uuid: 'reagent-new', revision: 2 } }
      }
      if (path === '/api/v1/reagents/reagent-new' && init?.method === 'DELETE') {
        return { code: 0 }
      }
      throw new Error(`unexpected request ${init?.method ?? 'GET'} ${path}`)
    })
    const port = createInventoryReadPort(
      { request } as HttpClient,
      getDefaultBackend('local-go')
    )

    await expect(port.createReagent({
      materialId: 'material-bottle',
      cas: '64-17-5',
      physicalState: 'liquid',
      quantity: 500,
      quantityUnit: 'mL',
      concentrationValue: 95,
      concentrationUnit: '%',
      source: 'frontend:robot-workstation'
    })).resolves.toEqual({ id: 'reagent-new', revision: 1 })
    await expect(port.updateReagent({
      id: 'reagent-new',
      quantity: 450,
      quantityUnit: 'mL',
      expectedRevision: 1,
      concentrationValue: 95,
      concentrationUnit: '%'
    })).resolves.toEqual({ id: 'reagent-new', revision: 2 })
    await expect(port.deleteReagent('reagent-new')).resolves.toBeUndefined()

    const createBody = JSON.parse(String(request.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    const updateBody = JSON.parse(String(request.mock.calls[1]?.[1]?.body)) as Record<string, unknown>
    expect(createBody).toMatchObject({
      material_uuid: 'material-bottle',
      cas: '64-17-5',
      quantity: 500,
      quantity_unit: 'mL',
      concentration_value: 95,
      concentration_unit: '%'
    })
    expect(updateBody).toMatchObject({
      quantity: 450,
      quantity_unit: 'mL',
      expected_revision: 1
    })
  })

  /** 证明试剂历史只接受 Backend 的 reagent 台账主体并保留任务追踪字段。 */
  it('maps immutable Backend reagent history', async () => {
    const request = vi.fn(async () => ({
      code: 0,
      data: {
        items: [{
          uuid: 'history-1', material_uuid: 'material-1',
          subject_type: 'reagent', subject_uuid: 'reagent-1',
          event_type: 'adjust', operator_type: 'frontend',
          quantity_delta: -5, quantity_unit: 'mL', revision: 4,
          workflow_task_uuid: null, workflow_node_job_uuid: null,
          trace_id: 'trace-1', recorded_at: '2026-08-13T00:00:00Z'
        }],
        page: 1,
        page_size: 100,
        has_more: false
      }
    }))
    const port = createInventoryReadPort(
      { request } as HttpClient,
      getDefaultBackend('local-go')
    )

    await expect(port.listReagentHistory('material-1')).resolves.toEqual({
      items: [{
        id: 'history-1', materialId: 'material-1', reagentId: 'reagent-1',
        eventType: 'adjust', operatorType: 'frontend', quantityDelta: -5,
        quantityUnit: 'mL', revision: 4, workflowTaskId: undefined,
        workflowNodeJobId: undefined, traceId: 'trace-1',
        recordedAt: '2026-08-13T00:00:00Z'
      }],
      page: 1,
      pageSize: 100,
      hasMore: false
    })
  })

  /** 证明 Edge 库存快照不能被误当成 Backend 试剂写接口。 */
  it('fails closed for reagent mutations on Edge', async () => {
    const port = createInventoryReadPort(
      { request: vi.fn() } as unknown as HttpClient,
      getDefaultBackend('local-python')
    )

    await expect(port.deleteReagent('lot-1')).rejects.toMatchObject({
      code: 'UNSUPPORTED_REAGENT_WRITE'
    })
  })

  /** 证明非法数量不会被前端静默归零。 */
  it('rejects malformed authoritative quantities', async () => {
    const request = vi.fn(async () => ({
      templates: [{ template_id: 'reagent-x', name: '试剂 X', category: 'reagent' }],
      lots: [{
        lot_id: 'lot-x', template_id: 'reagent-x', batch_no: '', unit: 'mL',
        quantity_total: '10', quantity_available: 10, quantity_reserved: 0,
        expiry: '', quarantined: 0, warehouse_zone_id: ''
      }]
    }))
    const port = createInventoryReadPort(
      { request } as HttpClient,
      getDefaultBackend('local-python')
    )

    await expect(port.listReagentInventory()).rejects.toMatchObject({
      code: 'INVALID_REAGENT_INVENTORY_RESPONSE'
    })
  })
})
