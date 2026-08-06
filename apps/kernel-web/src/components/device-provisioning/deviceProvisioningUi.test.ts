import { describe, expect, it } from 'vitest'
import type { LocalDeviceProvisioning } from '@unilab/device-provisioning'

import {
  configurationFields,
  initialConfigurationDraft,
  parseConfigurationDraft,
  provisioningStatusView,
  suggestedInstanceId
} from './deviceProvisioningUi'

/** 覆盖设备配置 Schema 和接入状态的 Renderer 纯投影。 */
describe('设备接入界面投影', () => {
  /** 验证字段顺序、必填合同与静态默认值来自 OS Schema。 */
  it('生成严格类型配置草稿并恢复 JSON 值', () => {
    const fields = configurationFields({
      type: 'object',
      required: ['endpoint'],
      properties: {
        endpoint: { type: 'string' },
        retries: { type: 'integer', default: 3 },
        enabled: { type: 'boolean', default: false },
        calibration: { type: 'object', default: { offset: 1.5 } }
      }
    })
    const draft = initialConfigurationDraft(fields, null)
    draft.endpoint = 'serial:///dev/ttyUSB0'
    draft.retries = '5'

    expect(parseConfigurationDraft(fields, draft)).toEqual({
      endpoint: 'serial:///dev/ttyUSB0',
      retries: 5,
      enabled: false,
      calibration: { offset: 1.5 }
    })
  })

  /** 验证首版不做字符串到错误类型的隐式容错。 */
  it('拒绝缺失必填值和非整数输入', () => {
    const fields = configurationFields({
      required: ['endpoint'],
      properties: {
        endpoint: { type: 'string' },
        retries: { type: 'integer' }
      }
    })

    expect(() => parseConfigurationDraft(fields, {
      endpoint: '',
      retries: '2'
    })).toThrow('endpoint 是必填配置')
    expect(() => parseConfigurationDraft(fields, {
      endpoint: 'serial:///dev/ttyUSB0',
      retries: '2.5'
    })).toThrow('retries 必须是整数')
  })

  /** 验证可运行状态必须同时通过文字与成功色表达。 */
  it('区分缓存、待激活、可运行与失败状态', () => {
    expect(provisioningStatusView('package_cached')).toMatchObject({
      label: '已缓存',
      tone: 'working'
    })
    expect(provisioningStatusView('ready')).toMatchObject({
      label: '可运行',
      tone: 'ready'
    })
    expect(provisioningStatusView('failed')).toMatchObject({
      label: '失败',
      tone: 'danger'
    })
  })

  /** 验证模板名称生成的本地建议 ID 不包含空格或标点。 */
  it('生成稳定本地实例 ID 建议', () => {
    expect(suggestedInstanceId({
      cloudDeviceName: 'Pump Controller V2',
      cloudDisplayName: '泵控制器'
    } as LocalDeviceProvisioning)).toBe('local-pump-controller-v2')
  })
})
