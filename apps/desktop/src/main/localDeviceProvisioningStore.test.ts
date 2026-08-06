import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import type { LocalDeviceProvisioning } from '@unilab/device-provisioning'

import { LocalDeviceProvisioningStore } from './localDeviceProvisioningStore'

const temporaryDirectories: string[] = []

/** 清理每个用例明确创建的临时目录。 */
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true
  })))
})

/** 覆盖 Electron userData 中本地设备接入事实的原子持久化合同。 */
describe('LocalDeviceProvisioningStore', () => {
  /** 验证新增、替换、排序与深拷贝不会泄漏内部可变引用。 */
  it('按接入 UUID 幂等保存并返回隔离副本', async () => {
    const { store, filePath } = await createStore()
    const older = provisioning('older', '2026-08-05T01:00:00.000Z')
    const newer = provisioning('newer', '2026-08-05T02:00:00.000Z')

    await store.put(older)
    await store.put(newer)
    const replacement = {
      ...older,
      status: 'ready' as const,
      actionCount: 2,
      updatedAt: '2026-08-05T03:00:00.000Z'
    }
    await store.put(replacement)
    replacement.configurationSchema.type = 'mutated-outside'

    const items = await store.list()
    expect(items.map((item) => item.provisioningId)).toEqual(['older', 'newer'])
    expect(items[0]).toMatchObject({ status: 'ready', actionCount: 2 })
    expect(items[0]?.configurationSchema).toEqual({ type: 'object' })
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      schemaVersion: 'local-device-provisioning-store/v1'
    })
  })

  /** 验证损坏合同会失败关闭，绝不被空状态静默覆盖。 */
  it('拒绝无效持久化文件合同', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-provisioning-store-'))
    temporaryDirectories.push(root)
    const filePath = join(root, 'state.json')
    await writeFile(filePath, JSON.stringify({ schemaVersion: 'unknown', items: [] }))

    await expect(new LocalDeviceProvisioningStore(filePath).list())
      .rejects.toThrow('状态文件合同无效')
  })

  /** 验证历史固定测试地址记录补齐环境后仍能安全重试。 */
  it('把缺少环境的旧记录迁移为测试环境', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-provisioning-store-'))
    temporaryDirectories.push(root)
    const filePath = join(root, 'state.json')
    const { cloudEnvironment: _legacyMissingField, ...legacy } = provisioning(
      'legacy',
      '2026-08-05T01:00:00.000Z'
    )
    await writeFile(filePath, JSON.stringify({
      schemaVersion: 'local-device-provisioning-store/v1',
      items: [legacy]
    }))

    await expect(new LocalDeviceProvisioningStore(filePath).list())
      .resolves.toEqual([
        expect.objectContaining({ cloudEnvironment: 'test' })
      ])
  })

  /** 验证未知环境不会被静默改投测试环境，避免跨环境读取或重试。 */
  it('拒绝包含未知云端环境的持久化记录', async () => {
    const root = await mkdtemp(join(tmpdir(), 'unilab-provisioning-store-'))
    temporaryDirectories.push(root)
    const filePath = join(root, 'state.json')
    await writeFile(filePath, JSON.stringify({
      schemaVersion: 'local-device-provisioning-store/v1',
      items: [{
        ...provisioning('corrupted', '2026-08-05T01:00:00.000Z'),
        cloudEnvironment: 'unknown'
      }]
    }))

    await expect(new LocalDeviceProvisioningStore(filePath).list())
      .rejects.toThrow('状态文件合同无效')
  })
})

/** 创建绑定测试临时文件的空接入存储。 */
async function createStore(): Promise<{
  store: LocalDeviceProvisioningStore
  filePath: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'unilab-provisioning-store-'))
  temporaryDirectories.push(root)
  const filePath = join(root, 'state.json')
  return { store: new LocalDeviceProvisioningStore(filePath), filePath }
}

/** 生成完整且不含秘密的本地设备接入 fixture。 */
function provisioning(
  provisioningId: string,
  updatedAt: string
): LocalDeviceProvisioning {
  return {
    schemaVersion: 'local-device-provisioning/v1',
    provisioningId,
    cloudEnvironment: 'test',
    templateUuid: '50afbb58-0f53-4ad6-9f73-24cfeb90a834',
    cloudDeviceName: 'pump',
    cloudDisplayName: 'Pump',
    packageName: 'review-lab',
    packageVersion: '1.2.0',
    artifactDigest: `sha256:${'a'.repeat(64)}`,
    catalogDigest: `sha256:${'b'.repeat(64)}`,
    definitionFqid: 'community.review_lab.pump',
    cacheKey: `community.review_lab@1.2.0#sha256:${'a'.repeat(64)}`,
    configurationSchema: { type: 'object' },
    configuration: null,
    instanceId: '',
    instanceUuid: '',
    displayName: 'Pump',
    graphPath: '/runtime/device-graph.json',
    graphFingerprint: '',
    backupPath: '',
    actionCount: 0,
    status: 'configuration_required',
    diagnostic: null,
    createdAt: '2026-08-05T01:00:00.000Z',
    updatedAt
  }
}
