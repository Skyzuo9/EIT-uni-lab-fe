import { describe, expect, it } from 'vitest'

import { cloudApiRootUrl, cloudServiceBaseUrl } from './authConfig'

/** 覆盖 Cloud HTTP service 与 OS CLI 对同一配置地址的不同投影。 */
describe('Cloud API 地址投影', () => {
  /** 验证已带 `/api/v1` 的配置不会在 services 请求中重复路径。 */
  it('区分 service base 与 CLI API root', () => {
    expect(cloudServiceBaseUrl('https://cloud.example/api/v1'))
      .toBe('https://cloud.example')
    expect(cloudApiRootUrl('https://cloud.example/api/v1'))
      .toBe('https://cloud.example/api/v1')
    expect(cloudApiRootUrl('https://cloud.example'))
      .toBe('https://cloud.example/api/v1')
  })

  /** 验证部署路径前缀被保留且危险 URL 元素被拒绝。 */
  it('保留部署前缀并拒绝凭据或 query', () => {
    expect(cloudServiceBaseUrl('https://cloud.example/leap/api/v1/'))
      .toBe('https://cloud.example/leap')
    expect(() => cloudApiRootUrl('https://user:secret@cloud.example'))
      .toThrow('无凭据')
    expect(() => cloudApiRootUrl('https://cloud.example?target=other'))
      .toThrow('无凭据')
  })
})
