import type { LocalRuntimePortRequirement } from './localRuntimePorts'

/** 本地子进程经过校验后可直接交给 Node.js spawn 的启动规范。 */
export interface LocalRuntimeSpawnSpec {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

/** 一次本地运行中由命令、端口释放和就绪探测共同使用的端口事实。 */
export interface LocalRuntimePorts {
  edgeHttp: number
  hostLink: number
  simulatorGui: number
  simulatorOpcUa: number
}

/** 领域侧边缘执行（Edge）的完整启动计划。 */
export interface LocalRuntimeLaunchPlan {
  runtimeDirectory: string
  edge: LocalRuntimeSpawnSpec
  ports: LocalRuntimePorts
  requiredPorts: LocalRuntimePortRequirement[]
  deviceCatalogRequirement: 'catalog' | 'domain_actions'
}

/** PLC-Sim 的完整启动计划。 */
export interface LocalSimulatorLaunchPlan {
  simulator: LocalRuntimeSpawnSpec
  ports: LocalRuntimePorts
  requiredPorts: LocalRuntimePortRequirement[]
}

export const LOCAL_RUNTIME_PORTS = {
  simulatorGui: 18_765,
  simulatorOpcUa: 4_855,
  edgeHttp: 18_003,
  hostLink: 18_004
} as const

export const LOCAL_RUNTIME_HOST = '127.0.0.1'

/**
 * 校验并冻结一次本地启动使用的全部端口事实。
 *
 * @param overrides 当前启动环境提供的完整端口集合。
 * @returns 同时驱动命令、就绪探测和端口释放的规范化端口集合。
 * @throws 任一端口不是 1 至 65535 范围内的安全整数时抛出错误。
 * @safety 不探测或释放端口，只校验数值。
 */
export function normalizeLocalRuntimePorts(
  overrides: LocalRuntimePorts
): LocalRuntimePorts {
  return {
    edgeHttp: validLocalRuntimePort('领域侧 Edge HTTP', overrides.edgeHttp),
    hostLink: validLocalRuntimePort('Edge HostLink', overrides.hostLink),
    simulatorGui: validLocalRuntimePort(
      'PLC-Sim Web GUI',
      overrides.simulatorGui
    ),
    simulatorOpcUa: validLocalRuntimePort(
      'PLC-Sim OPC UA',
      overrides.simulatorOpcUa
    )
  }
}

/**
 * 校验启动配置中的单个 TCP 端口。
 *
 * @param label 端口所属模块的用户可见名称。
 * @param port 待校验端口值。
 * @returns 1 至 65535 范围内的整数端口。
 * @throws 端口越界或不是安全整数时抛出错误。
 * @safety 不执行网络探测。
 */
function validLocalRuntimePort(label: string, port: number): number {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${label}不是有效 TCP 端口：${port}`)
  }
  return port
}
