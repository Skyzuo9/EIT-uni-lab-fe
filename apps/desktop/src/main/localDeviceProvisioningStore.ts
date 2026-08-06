import type { LocalDeviceProvisioning } from '@unilab/device-provisioning'

import { open, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

interface StoreDocument {
  schemaVersion: 'local-device-provisioning-store/v1'
  items: LocalDeviceProvisioning[]
}

/** 候选本地设备接入（LocalDeviceProvisioning）的 Electron Main 持久化存储。 */
export class LocalDeviceProvisioningStore {
  private items: LocalDeviceProvisioning[] | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  /**
   * 创建绑定到 Electron userData 文件的本地设备接入存储。
   *
   * @param filePath 主进程解析的固定持久化文件路径。
   */
  constructor(private readonly filePath: string) {}

  /**
   * 读取按更新时间倒序排列的接入记录副本。
   *
   * @returns 不与内部数组共享引用的接入记录。
   * @throws 文件存在但合同损坏时抛出错误，避免静默覆盖用户事实。
   */
  async list(): Promise<LocalDeviceProvisioning[]> {
    await this.ensureLoaded()
    return [...(this.items ?? [])]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneProvisioning)
  }

  /**
   * 按稳定接入 UUID 读取一条记录。
   *
   * @param provisioningId Electron Main 生成的稳定接入身份。
   * @returns 命中时返回深拷贝，否则返回 null。
   */
  async get(provisioningId: string): Promise<LocalDeviceProvisioning | null> {
    await this.ensureLoaded()
    const item = this.items?.find(
      (candidate) => candidate.provisioningId === provisioningId
    )
    return item ? cloneProvisioning(item) : null
  }

  /**
   * 按接入 UUID 幂等新增或替换一条持久事实并原子保存。
   *
   * @param item 已由 Main 编排器完成状态转换和脱敏的接入记录。
   * @returns 完成持久化后的记录副本。
   */
  async put(item: LocalDeviceProvisioning): Promise<LocalDeviceProvisioning> {
    await this.ensureLoaded()
    const items = this.items ?? []
    const index = items.findIndex(
      (candidate) => candidate.provisioningId === item.provisioningId
    )
    const copy = cloneProvisioning(item)
    if (index >= 0) items[index] = copy
    else items.push(copy)
    this.items = items
    await this.enqueueWrite()
    return cloneProvisioning(copy)
  }

  /** 从固定文件延迟加载并严格验证存储根合同。 */
  private async ensureLoaded(): Promise<void> {
    if (this.items) return
    let payload: string
    try {
      payload = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        this.items = []
        return
      }
      throw error
    }
    const parsed: unknown = JSON.parse(payload)
    if (!isStoreDocument(parsed)) {
      throw new Error('本地设备接入状态文件合同无效，已停止自动覆盖')
    }
    this.items = parsed.items.map(cloneProvisioning)
  }

  /** 串行化磁盘写入，防止两个状态推进交叉覆盖同一文件。 */
  private enqueueWrite(): Promise<void> {
    const snapshot: StoreDocument = {
      schemaVersion: 'local-device-provisioning-store/v1',
      items: (this.items ?? []).map(cloneProvisioning)
    }
    this.writeQueue = this.writeQueue.then(() => writeAtomic(
      this.filePath,
      JSON.stringify(snapshot, null, 2) + '\n'
    ))
    return this.writeQueue
  }
}

/** 使用同目录独占临时文件和 rename 原子替换接入状态文件。 */
async function writeAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(temporaryPath, 'wx', 0o600)
    await handle.writeFile(content, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await rename(temporaryPath, filePath)
  } finally {
    await handle?.close()
    await rm(temporaryPath, { force: true })
  }
}

/** 判断未知 JSON 是否满足版本化本地接入存储根合同。 */
function isStoreDocument(value: unknown): value is StoreDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const raw = value as Record<string, unknown>
  return raw.schemaVersion === 'local-device-provisioning-store/v1'
    && Array.isArray(raw.items)
    && raw.items.every(isProvisioning)
}

/** 对持久化记录执行最小稳定身份和状态字段校验。 */
function isProvisioning(value: unknown): value is LocalDeviceProvisioning {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const raw = value as Record<string, unknown>
  return raw.schemaVersion === 'local-device-provisioning/v1'
    && typeof raw.provisioningId === 'string'
    && typeof raw.templateUuid === 'string'
    && typeof raw.status === 'string'
    && typeof raw.createdAt === 'string'
    && typeof raw.updatedAt === 'string'
}

/** 通过结构化克隆隔离配置 Schema、配置值和诊断的可变引用。 */
function cloneProvisioning(
  item: LocalDeviceProvisioning
): LocalDeviceProvisioning {
  return structuredClone(item)
}

/** 把未知异常收窄为带 Node 文件系统错误码的对象。 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
