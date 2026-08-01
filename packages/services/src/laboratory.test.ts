import { describe, expect, it } from 'vitest'

import type { HttpClient } from './http'
import { createLaboratoryService } from './laboratory'
import { getDefaultBackend } from './backends'

describe('laboratory service', () => {
  it('projects Action devices and schemas from the unified node catalog', async () => {
    const http = fixtureHttp({
      '/api/v1/workflow-node-templates': {
        schemaVersion: 'workflow-node-templates/v1',
        items: [
          {
            id: 'pump-1.aspirate',
            kind: 'action',
            label: '吸液',
            inputSchema: {
              volume: { type: 'number', default: 10 }
            },
            outputSchema: {}
          },
          {
            id: 'pump-1.dispense',
            kind: 'action',
            label: '排液',
            inputSchema: {
              volume: { type: 'number', default: 2 }
            },
            outputSchema: {}
          },
          {
            id: 'os_control.branch',
            kind: 'branch',
            label: '条件分支',
            inputSchema: {}
          }
        ]
      }
    })
    const service = createLaboratoryService(
      http,
      getDefaultBackend('local-python')
    )

    await expect(service.getActionDevices()).resolves.toEqual([
      { deviceId: 'pump-1', label: 'pump-1' }
    ])
    await expect(service.getDeviceActions('pump-1')).resolves.toMatchObject([
      {
        actionName: 'aspirate',
        actionRef: 'pump-1.aspirate',
        displayName: '吸液',
        label: '吸液',
        typeName: 'pump-1.aspirate',
        isBusy: false,
        currentJobId: null,
        schema: {
          type: 'object',
          properties: {
            volume: { type: 'number', default: 10 }
          }
        }
      },
      {
        actionName: 'dispense',
        actionRef: 'pump-1.dispense',
        displayName: '排液',
        label: '排液',
        typeName: 'pump-1.dispense',
        isBusy: false,
        currentJobId: null,
        schema: {
          type: 'object',
          properties: {
            volume: { type: 'number', default: 2 }
          }
        }
      }
    ])
    await expect(service.getOnlineDevices()).resolves.toMatchObject([
      {
        id: 'pump-1',
        online: true,
        actions: [
          { actionRef: 'pump-1.aspirate' },
          { actionRef: 'pump-1.dispense' }
        ]
      }
    ])
    await expect(
      service.getActionSchema('pump-1', 'aspirate')
    ).resolves.toMatchObject({
      goalDefault: { volume: 10 },
      actionType: 'pump-1.aspirate'
    })
  })

  it('does not expose the retired direct Action Run transport', () => {
    const service = createLaboratoryService(
      fixtureHttp({}),
      getDefaultBackend('local-python')
    )

    expect(Object.keys(service)).not.toEqual(expect.arrayContaining([
      'addJob',
      'getJobStatus',
      'cancelJob'
    ]))
  })

  it('probes the production Python OS through its versioned health route', async () => {
    const requests: Array<{
      path: string
      method?: string
      body?: string
    }> = []
    const service = createLaboratoryService(
      fixtureHttp({ '/api/v1/health': { status: 'ok' } }, requests),
      getDefaultBackend('local-python')
    )

    await expect(service.ping()).resolves.toBe(true)
    expect(requests).toEqual([
      {
        path: '/api/v1/health',
        method: undefined,
        body: undefined
      }
    ])
  })
})

function fixtureHttp(
  responses: Record<string, unknown>,
  requests: Array<{
    path: string
    method?: string
    body?: string
  }> = []
): HttpClient {
  return {
    request: async <ResponseValue>(
      path: string,
      init?: RequestInit
    ): Promise<ResponseValue> => {
      requests.push({
        path,
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined
      })
      if (!(path in responses)) throw new Error(`Unexpected request: ${path}`)
      return responses[path] as ResponseValue
    }
  }
}
