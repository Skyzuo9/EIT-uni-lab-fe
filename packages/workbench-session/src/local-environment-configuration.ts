import { readFile, rename, rm, writeFile } from 'node:fs/promises'

import { WorkbenchLaunchError } from './launch-error'

export type PersistedWorkbenchRuntimeMode = 'normal' | 'dry-run'

export interface LocalEnvironmentConfiguration {
  graphPath: string | null
  plcSimulatorProjectPath: string | null
  runtimeMode: PersistedWorkbenchRuntimeMode | null
}

export interface WritableLocalEnvironmentConfiguration {
  graphPath: string
  plcSimulatorProjectPath: string
  runtimeMode: PersistedWorkbenchRuntimeMode
}

/** Read the optional managed-local configuration and reject corrupt state. */
export async function readLocalEnvironmentConfiguration(
  configurationPath: string
): Promise<LocalEnvironmentConfiguration> {
  let source: string
  try {
    source = await readFile(configurationPath, 'utf8')
  } catch (error) {
    if (isRecord(error) && error['code'] === 'ENOENT') {
      return { graphPath: null, plcSimulatorProjectPath: null, runtimeMode: null }
    }
    throw invalidLocalEnvironmentConfiguration(
      configurationPath,
      '本地环境配置无法读取'
    )
  }
  let content: unknown
  try {
    content = JSON.parse(source) as unknown
  } catch {
    throw invalidLocalEnvironmentConfiguration(
      configurationPath,
      '本地环境配置不是有效 JSON'
    )
  }
  if (!isRecord(content) || content['schemaVersion'] !== 1) {
    throw invalidLocalEnvironmentConfiguration(
      configurationPath,
      '本地环境配置 schemaVersion 无效'
    )
  }
  const graphPath = optionalString(
    content['graphPath'],
    configurationPath,
    'graphPath'
  )
  const plcSimulatorProjectPath = optionalString(
    content['plcSimulatorProjectPath'],
    configurationPath,
    'plcSimulatorProjectPath'
  )
  return {
    graphPath,
    plcSimulatorProjectPath,
    runtimeMode: persistedRuntimeMode(content['runtimeMode'], configurationPath)
  }
}

/** Atomically replace the managed-local configuration after validation. */
export async function writeLocalEnvironmentConfigurationFile(
  configurationPath: string,
  configuration: WritableLocalEnvironmentConfiguration
): Promise<void> {
  const temporaryPath = `${configurationPath}.${process.pid}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify({
      schemaVersion: 1,
      ...configuration
    }, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryPath, configurationPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function optionalString(
  value: unknown,
  configurationPath: string,
  field: string
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  throw invalidLocalEnvironmentConfiguration(
    configurationPath,
    `本地环境配置 ${field} 无效`
  )
}

function persistedRuntimeMode(
  value: unknown,
  configurationPath: string
): PersistedWorkbenchRuntimeMode | null {
  if (value === 'normal' || value === 'real-device') return 'normal'
  if (value === 'dry-run' || value === 'simulation') return 'dry-run'
  if (value === undefined || value === null) return null
  throw invalidLocalEnvironmentConfiguration(
    configurationPath,
    '本地环境配置 runtimeMode 无效'
  )
}

function invalidLocalEnvironmentConfiguration(
  configurationPath: string,
  message: string
): WorkbenchLaunchError {
  return new WorkbenchLaunchError(
    'invalid_workspace',
    `${message}：${configurationPath}`,
    `修复或删除 ${configurationPath} 后重新启动 Workbench`
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}
