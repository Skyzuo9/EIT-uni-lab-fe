import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createConnection } from 'node:net'

import type { LocalRuntimeProcessKind } from '../shared/localRuntime'
import type { LocalRuntimeLaunchPlan } from './localRuntimeLaunchContract'
import type { LocalRuntimePortRequirement } from './localRuntimePorts'
import { localRuntimeProcessLabel } from './localRuntimeProcess'

const LOCAL_RUNTIME_HOST = '127.0.0.1'
const PORT_RELEASE_TIMEOUT_MS = 5_000

/** 带诊断名称、供就绪探测确认存活的受管理子进程。 */
export interface ManagedLocalRuntimeChild {
  kind: LocalRuntimeProcessKind
  child: ChildProcessWithoutNullStreams
  label: string
}

/**
 * 使用已解析的 Edge HTTP 端口构造本地就绪探测 URL。
 *
 * @param port 当前启动计划的 Edge HTTP 端口。
 * @param path 固定的 OS HTTP 路径。
 * @returns 指向本机领域侧边缘执行（Edge）的完整 URL。
 * @throws 不抛出异常；端口已由启动合同校验。
 * @safety 始终固定到回环地址，不接受远端主机。
 */
export function localRuntimeEdgeHttpUrl(port: number, path: string): string {
  return `http://${LOCAL_RUNTIME_HOST}:${port}${path}`
}

/**
 * 等待已终止监听者真正释放全部端口，并在超时后报告仍占用的模块。
 *
 * @param requirements 已执行平台清理的端口要求。
 * @returns 全部端口均不可连接时完成。
 * @throws 超时后仍有端口可连接时抛出带模块名称的错误。
 * @safety 只连接回环地址进行诊断，不终止任何进程。
 */
export async function requireAvailablePorts(
  requirements: LocalRuntimePortRequirement[]
): Promise<void> {
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS
  while (Date.now() < deadline) {
    let occupiedRequirement: LocalRuntimePortRequirement | null = null
    for (const requirement of requirements) {
      if (await canConnect(LOCAL_RUNTIME_HOST, requirement.port)) {
        occupiedRequirement = requirement
        break
      }
    }
    if (!occupiedRequirement) return
    await delay(100)
  }
  for (const requirement of requirements) {
    if (!await canConnect(LOCAL_RUNTIME_HOST, requirement.port)) continue
    throw new Error(
      `${requirement.label} 端口 ${requirement.port} 清理后仍被占用`
    )
  }
}

/**
 * 轮询 JSON HTTP 端点，直到响应满足调用方声明的就绪条件。
 *
 * @param url 固定本地服务 URL。
 * @param children 必须在等待期间保持存活的子进程。
 * @param timeoutMs 最大等待毫秒数。
 * @param accepts 判断响应载荷是否达到当前启动阶段的回调。
 * @returns 首个成功且满足条件的响应出现时完成。
 * @throws 子进程提前退出或等待超时时抛出中文诊断。
 * @safety 每次请求一秒超时，连接失败只在启动窗口内重试。
 */
export async function waitForLocalRuntimeHttp(
  url: string,
  children: ManagedLocalRuntimeChild[],
  timeoutMs: number,
  accepts: (payload: unknown) => boolean
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    requireLivingProcesses(children)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok && accepts(await response.json())) return
    } catch {
      // 服务启动期间连接失败属于预期状态。
    }
    await delay(250)
  }
  throw new Error(`等待服务就绪超时：${url}`)
}

/**
 * 将可空的进程引用收窄为带来源标签的就绪探测列表。
 *
 * @param children 进程来源和可空进程引用的元组。
 * @returns 过滤空引用后的受管理进程列表。
 * @throws 不抛出异常。
 * @safety 只读取进程引用，不改变生命周期。
 */
export function managedLocalRuntimeChildren(
  children: Array<[
    LocalRuntimeProcessKind,
    ChildProcessWithoutNullStreams | null
  ]>
): ManagedLocalRuntimeChild[] {
  return children.flatMap(([kind, child]) => child
    ? [{ kind, child, label: localRuntimeProcessLabel(kind) }]
    : [])
}

/**
 * 等待 PLC-Sim OPC UA 端口可连接，同时监控子进程是否提前退出。
 *
 * @param port 已校验的 OPC UA 端口。
 * @param children 必须保持存活的子进程与诊断名称。
 * @param timeoutMs 最大等待毫秒数。
 * @returns 端口首次可连接时完成。
 * @throws 子进程提前退出或等待超时时抛出中文诊断。
 * @safety 只探测回环地址，不发送应用载荷。
 */
export async function waitForLocalRuntimePort(
  port: number,
  children: Array<{ child: ChildProcessWithoutNullStreams; label: string }>,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const { child, label } of children) requireLivingProcess(child, label)
    if (await canConnect(LOCAL_RUNTIME_HOST, port)) return
    await delay(250)
  }
  throw new Error(
    `等待 OPC UA 端口就绪超时：${LOCAL_RUNTIME_HOST}:${port}`
  )
}

/**
 * 判断设备目录响应是否满足空设备或领域动作模式的就绪要求。
 *
 * @param payload OS 设备目录端点返回的未知 JSON 载荷。
 * @param requirement 当前启动计划冻结的目录就绪要求。
 * @returns 合同结构有效且满足所需目录内容时返回 true。
 * @throws 不抛出异常；格式错误按尚未就绪处理。
 * @safety 不把 host_node 当作用户设备，也不放宽领域动作要求。
 */
export function isDeviceCatalogReady(
  payload: unknown,
  requirement: LocalRuntimeLaunchPlan['deviceCatalogRequirement']
): boolean {
  if (!isRecord(payload) || payload['code'] !== 0) return false
  const data = payload['data']
  if (
    !isRecord(data)
    || data['schemaVersion'] !== 'device-catalog/v1'
    || !Array.isArray(data['items'])
  ) return false
  if (requirement === 'catalog') return true
  return data['items'].some((value) => {
    if (!isRecord(value) || value['id'] === 'host_node') return false
    return Array.isArray(value['actions']) && value['actions'].length > 0
  })
}

/**
 * 判断 OS 健康端点是否返回成功状态。
 *
 * @param payload 健康端点返回的未知 JSON 载荷。
 * @returns 载荷是记录且 status 为 ok 时返回 true。
 * @throws 不抛出异常；格式错误按尚未就绪处理。
 * @safety 只读取固定状态字段，不信任其他响应内容。
 */
export function isLocalRuntimeHealthReady(payload: unknown): boolean {
  return isRecord(payload) && payload['status'] === 'ok'
}

/**
 * 对回环 TCP 端口执行一次有界连接探测。
 *
 * @param host 固定回环主机。
 * @param port 已校验端口。
 * @returns 750 毫秒内连接成功返回 true，否则返回 false。
 */
function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host, port })
    let settled = false
    const finish = (connected: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolveResult(connected)
    }
    socket.setTimeout(750)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/**
 * 检查一组就绪依赖子进程是否仍存活。
 *
 * @param children 带诊断名称的受管理子进程。
 * @returns 全部进程存活时正常返回。
 * @throws 任一进程提前退出时抛出中文诊断。
 */
function requireLivingProcesses(children: ManagedLocalRuntimeChild[]): void {
  for (const { child, label } of children) requireLivingProcess(child, label)
}

/**
 * 检查单个就绪依赖子进程，提前退出时关闭失败。
 *
 * @param child 受管理子进程引用。
 * @param label 用户可见诊断名称。
 * @returns 进程仍存活时正常返回。
 * @throws 进程已有退出码或信号时抛出错误。
 */
function requireLivingProcess(
  child: ChildProcessWithoutNullStreams,
  label: string
): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error(`${label} 在服务就绪前退出，请点击右上角“查看日志”`)
  }
}

/**
 * 将未知 JSON 值安全收窄为可索引记录。
 *
 * @param value 待检查的未知值。
 * @returns 非空对象返回 true。
 * @throws 不抛出异常。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

/**
 * 等待指定毫秒数，供有界轮询让出事件循环。
 *
 * @param milliseconds 非负等待时长。
 * @returns 定时器到期后完成。
 * @throws 不抛出异常。
 */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveResult) => setTimeout(resolveResult, milliseconds))
}
