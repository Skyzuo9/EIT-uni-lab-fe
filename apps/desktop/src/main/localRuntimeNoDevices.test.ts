import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { LocalRuntimeLaunchConfig } from '../shared/localRuntime'
import { resolveLocalRuntimeLaunchPlan } from './localRuntimeManager'

const temporaryDirectories: string[] = []

/**
 * 清理空设备启动测试创建的临时 OS 与 Conda 目录。
 *
 * @returns 所有临时目录删除完成后结束。
 * @throws 删除失败时透传文件系统异常。
 * @safety 只删除由当前测试登记的 mkdtemp 子目录。
 */
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, {
    recursive: true,
    force: true
  })))
})

describe('LocalRuntimeManager empty device startup', () => {
  /**
   * 验证未配置设备包和设备图时，生成命令不携带对应参数但仍启动 OS 核心。
   *
   * @returns 无返回值；通过启动计划断言 argv、目录与目录要求。
   * @throws 启动计划仍强制要求设备图或设备包时由断言报告失败。
   * @safety 只构造子进程计划，不实际启动领域侧 Edge。
   */
  it('omits workspace and graph arguments for an empty device setup', async () => {
    const config = await createEmptyDeviceConfig()

    const plan = await resolveLocalRuntimeLaunchPlan(config)

    expect(plan.edge.args).not.toContain('--workspace')
    expect(plan.edge.args).not.toContain('--graph')
    expect(plan.edge.cwd).toBe(config.osProjectPath)
    expect(plan.deviceCatalogRequirement).toBe('catalog')
  })

  /**
   * 验证用户一旦显式配置设备图，缺失文件仍按配置错误失败。
   *
   * @returns 无返回值；通过拒绝消息断言显式配置不被空设备模式掩盖。
   * @throws 启动计划错误接受不存在的设备图时由断言报告失败。
   * @safety 只检查临时路径，不启动进程或读取真实设备配置。
   */
  it('still rejects an explicitly configured missing device graph', async () => {
    const config = await createEmptyDeviceConfig()
    const missingGraph = join(config.osProjectPath, 'missing-device.json')

    await expect(resolveLocalRuntimeLaunchPlan({
      ...config,
      graphPath: missingGraph
    })).rejects.toThrow('设备图 JSON 不存在')
  })
})

/**
 * 创建只包含 OS 核心和 Conda unilab 入口的最小桌面启动配置。
 *
 * @returns graphPath 与 szlabProjectPath 为空的隔离启动配置。
 * @throws 临时目录或占位文件创建失败时透传文件系统异常。
 * @safety 所有文件均位于当前测试创建的系统临时目录。
 */
async function createEmptyDeviceConfig(): Promise<LocalRuntimeLaunchConfig> {
  const root = await mkdtemp(join(tmpdir(), 'unilab-empty-devices-'))
  temporaryDirectories.push(root)
  const osProjectPath = join(root, 'Uni-Lab-OS')
  const environmentPath = join(root, 'env')
  await Promise.all([
    mkdir(join(osProjectPath, 'unilabos', 'config'), { recursive: true }),
    mkdir(join(environmentPath, 'bin'), { recursive: true })
  ])
  await Promise.all([
    writeFile(
      join(osProjectPath, 'unilabos', 'config', 'example_config.py'),
      '# 空设备启动测试配置\n'
    ),
    writeFile(join(environmentPath, 'bin', 'unilab'), '#!/bin/sh\n')
  ])
  await chmod(join(environmentPath, 'bin', 'unilab'), 0o755)
  return {
    graphPath: '',
    osProjectPath,
    szlabProjectPath: '',
    environmentPath,
    simulatorProjectPath: '',
    edgeCommandMode: 'generated',
    customEdgeCommand: {
      executable: '',
      workingDirectory: '',
      args: [],
      environment: []
    }
  }
}
