import {
  type LocalDeviceProvisioningStatus
} from '@unilab/device-provisioning'
import {
  createDeviceSquareService,
  createHttpClient,
  createLaboratoryService,
  type BackendConfig,
  type DeviceSquareService
} from '@unilab/services'

import {
  cloudApiRootUrl,
  cloudServiceBaseUrl
} from './authConfig'
import { readSession } from './authManager'
import type { DevicePackageCliConfig } from './devicePackageCli'

const CLOUD_BACKEND: BackendConfig = {
  id: 'cloud-device-square',
  name: 'Uni-Lab 云端设备广场',
  protocol: 'unilab/v1',
  apiUrl: cloudServiceBaseUrl(),
  auth: 'oauth',
  serverKind: 'backend',
  workspaceMode: 'laboratory'
}

/** 创建带当前 OAuth 会话读取函数的现有云端设备广场 Adapter。 */
export function createCloudDeviceSquare(): DeviceSquareService {
  return createDeviceSquareService(createHttpClient({
    backend: CLOUD_BACKEND,
    getAccessToken: () => readSession()?.token ?? null,
    timeoutMs: 20_000
  }))
}

/**
 * 创建只指向当前本机 Edge 的在线设备与 Action 读取 Adapter。
 *
 * @param apiUrl Main 从已成功启动 Runtime 冻结的本机 API 地址。
 * @returns 以本机 Edge 为唯一事实源的实验室服务。
 * @safety 调用方必须使用 Runtime 权威地址，不接受 Renderer 提供的远端地址。
 */
export function createLocalLaboratory(apiUrl: string) {
  const backend: BackendConfig = {
    id: 'local-device-provisioning-runtime',
    name: '本地设备接入运行时',
    protocol: 'unilab/v1',
    apiUrl,
    auth: 'none',
    serverKind: 'edge',
    workspaceMode: 'singleton'
  }
  return createLaboratoryService(createHttpClient({ backend }), backend)
}

/**
 * 把已验证 LocalRuntime 事实投影为设备包 CLI 配置。
 *
 * @param runtime Main 已成功启动并保存的 CLI 路径与工作目录。
 * @returns 绑定现有云端 Backend 地址的 CLI 配置。
 */
export function devicePackageCliConfig(runtime: {
  unilabExecutable: string
  commandWorkingDirectory: string
  managedWorkingDirectory: string
}): DevicePackageCliConfig {
  return {
    ...runtime,
    backendBaseUrl: cloudApiRootUrl()
  }
}

/** 把未知异常规范化为可持久化、可展示且不含 argv 的正文。 */
export function provisioningErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 把失败阶段映射为唯一安全重试动作，不根据字段存在性猜测副作用。 */
export function provisioningRetryAction(
  stage: LocalDeviceProvisioningStatus | undefined
): 'configure' | 'activate' | 'remove' | 'restore' | 'download' | null {
  if (stage === 'configuration_required') return 'configure'
  if (stage === 'activating' || stage === 'driver_ready') return 'activate'
  if (stage === 'removing') return 'remove'
  if (stage === 'removed' || stage === 'ready') return 'restore'
  if (
    stage === 'requested'
    || stage === 'resolving'
    || stage === 'downloading'
    || stage === 'package_cached'
  ) return 'download'
  return null
}

/**
 * 上传后短暂重读现有包列表，确认当前 Cloud 广场能看到 distribution。
 *
 * @param distribution CLI 已确认发布成功的 Python distribution 名称。
 * @returns 五次有界重读内可见时为 true；上传成功但传播未完成时为 false。
 */
export async function confirmPublishedDevicePackage(
  distribution: string
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const packages = await createCloudDeviceSquare().listPackages()
    if (packages.some((item) => item.name === distribution)) return true
    await new Promise((resolve) => globalThis.setTimeout(resolve, 500))
  }
  return false
}
