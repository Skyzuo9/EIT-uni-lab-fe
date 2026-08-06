import { basename, join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  createDiagnosticLogSessionId,
  openLocalRuntimeLogDirectory,
  resolveDesktopMainLogPath,
  resolveLocalRuntimeLogPath
} from './diagnosticLogSession'

/** 覆盖应用级诊断日志会话的命名、分组与安全边界。 */
describe('diagnostic log session', () => {
  /** 验证会话标识以可排序的 UTC 启动时间开头，并以随机 UUID 防止重启碰撞。 */
  it('creates sortable and unique application startup session ids', () => {
    const startedAt = new Date('2026-08-05T01:02:03.004Z')

    const first = createDiagnosticLogSessionId(startedAt)
    const second = createDiagnosticLogSessionId(startedAt)
    const later = createDiagnosticLogSessionId(
      new Date('2026-08-05T01:02:04.004Z')
    )

    expect(first).toMatch(
      /^20260805T010203\.004Z-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(second).not.toBe(first)
    expect([second, first].sort()[0]?.slice(0, 20)).toBe(
      '20260805T010203.004Z'
    )
    expect([later, first].sort()).toEqual([first, later])
  })

  /** 验证同一应用会话的主进程与两个本地运行进程共享文件名前缀。 */
  it('groups main, simulator and Edge logs under one session id', () => {
    const sessionId =
      '20260805T010203.004Z-12345678-1234-4123-8123-123456789abc'
    const homeDirectory = join('/tmp', 'home')
    const logsDirectory = join('/tmp', 'logs')

    expect(basename(resolveDesktopMainLogPath(homeDirectory, sessionId))).toBe(
      `lab-pc-client-${sessionId}.log`
    )
    expect(basename(
      resolveLocalRuntimeLogPath(logsDirectory, sessionId, 'simulator')
    )).toBe(`${sessionId}-simulator.log`)
    expect(basename(
      resolveLocalRuntimeLogPath(logsDirectory, sessionId, 'edge')
    )).toBe(`${sessionId}-edge.log`)
  })

  /** 验证非法时间不会生成无法归档或排序的诊断日志会话。 */
  it('rejects an invalid application startup timestamp', () => {
    expect(() => createDiagnosticLogSessionId(new Date(Number.NaN))).toThrow(
      '应用启动时间无效'
    )
  })

  /** 验证系统文件管理器只打开安全创建后的当前诊断日志目录。 */
  it('creates and opens the current diagnostic log directory', async () => {
    const logsDirectory = join('/tmp', 'logs', 'local-runtime')
    const createDirectory = vi.fn(async () => undefined)
    const openPath = vi.fn(async () => '')

    const result = await openLocalRuntimeLogDirectory(logsDirectory, {
      createDirectory,
      openPath
    })

    expect(createDirectory).toHaveBeenCalledWith(logsDirectory)
    expect(openPath).toHaveBeenCalledWith(logsDirectory)
    expect(result).toEqual({ opened: true })
  })

  /** 验证日志目录创建失败时不调用系统文件管理器，并返回可行动提示。 */
  it('reports a directory creation failure without opening a path', async () => {
    const openPath = vi.fn(async () => '')

    const result = await openLocalRuntimeLogDirectory('/protected/logs', {
      createDirectory: async () => {
        throw new Error('permission denied')
      },
      openPath
    })

    expect(openPath).not.toHaveBeenCalled()
    expect(result).toEqual({
      opened: false,
      error: '无法创建日志目录：permission denied'
    })
  })

  /** 验证系统文件管理器拒绝打开目录时保留平台返回的具体原因。 */
  it('reports a system file manager failure', async () => {
    const result = await openLocalRuntimeLogDirectory('/tmp/logs', {
      createDirectory: async () => undefined,
      openPath: async () => 'No application is associated with this path'
    })

    expect(result).toEqual({
      opened: false,
      error: '无法打开日志目录：No application is associated with this path'
    })
  })
})
