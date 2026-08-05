import { describe, expect, it, vi } from 'vitest'

import {
  releaseListeningPorts,
  type LocalRuntimeCommandRunner
} from './localRuntimePorts'

describe('releaseListeningPorts', () => {
  /** 证明 macOS 按端口查询监听 PID，并在多个端口命中同一进程时只终止一次。 */
  it('deduplicates listener processes on macOS before forcing termination', async () => {
    /** 模拟 lsof：两个端口都由 PID 41 监听，第二个端口还包含 PID 42。 */
    const commandRunner: LocalRuntimeCommandRunner = vi.fn(
      async (_command, args) => ({
        stdout: args.includes('-iTCP:18003') ? '41\n' : '41\n42\n',
        stderr: ''
      })
    )
    /** 记录模块请求强制终止的监听进程身份。 */
    const processKiller = vi.fn<(pid: number, signal: NodeJS.Signals) => void>()

    await expect(releaseListeningPorts([
      { port: 18_003, label: '领域侧 Edge HTTP' },
      { port: 18_765, label: 'PLC-Sim Web GUI' },
      { port: 18_003, label: '重复端口' }
    ], {
      platform: 'darwin',
      commandRunner,
      processKiller,
      currentProcessId: 999
    })).resolves.toEqual([41, 42])

    expect(commandRunner).toHaveBeenNthCalledWith(1, 'lsof', [
      '-nP',
      '-tiTCP:18003',
      '-sTCP:LISTEN'
    ])
    expect(commandRunner).toHaveBeenNthCalledWith(2, 'lsof', [
      '-nP',
      '-tiTCP:18765',
      '-sTCP:LISTEN'
    ])
    expect(processKiller).toHaveBeenCalledTimes(2)
    expect(processKiller).toHaveBeenNthCalledWith(1, 41, 'SIGKILL')
    expect(processKiller).toHaveBeenNthCalledWith(2, 42, 'SIGKILL')
  })

  /** 证明 lsof 未找到监听者的退出状态不会中断 macOS 启动。 */
  it('treats an empty lsof result as an idempotent success', async () => {
    /** 模拟 lsof 的标准“未匹配”退出码 1。 */
    const commandRunner: LocalRuntimeCommandRunner = vi.fn(async () => {
      throw Object.assign(new Error('no matches'), {
        code: 1,
        stdout: '',
        stderr: ''
      })
    })
    /** 验证没有监听者时不会发出终止请求。 */
    const processKiller = vi.fn<(pid: number, signal: NodeJS.Signals) => void>()

    await expect(releaseListeningPorts([
      { port: 18_003, label: '领域侧 Edge HTTP' }
    ], {
      platform: 'darwin',
      commandRunner,
      processKiller
    })).resolves.toEqual([])
    expect(processKiller).not.toHaveBeenCalled()
  })

  /** 证明 Windows 只把校验后的端口作为 PowerShell 参数传入，不拼接 POSIX shell。 */
  it('uses PowerShell listener discovery and forced termination on Windows', async () => {
    /** 返回 Windows 平台已终止的两个去重 PID。 */
    const commandRunner: LocalRuntimeCommandRunner = vi.fn(async () => ({
      stdout: '51\r\n52\r\n51\r\n',
      stderr: ''
    }))
    /** Windows 应由 PowerShell 自己终止进程，不调用 POSIX 信号接口。 */
    const processKiller = vi.fn<(pid: number, signal: NodeJS.Signals) => void>()

    await expect(releaseListeningPorts([
      { port: 18_003, label: '领域侧 Edge HTTP' },
      { port: 18_004, label: 'Edge HostLink' }
    ], {
      platform: 'win32',
      commandRunner,
      processKiller,
      currentProcessId: 999
    })).resolves.toEqual([51, 52])

    expect(commandRunner).toHaveBeenCalledTimes(1)
    const [command, args] = vi.mocked(commandRunner).mock.calls[0]
    expect(command).toBe('powershell.exe')
    expect(args.slice(-3)).toEqual(['999', '18003', '18004'])
    expect(args.slice(-2)).toEqual(['18003', '18004'])
    expect(args).toContain('-NoProfile')
    expect(args).toContain('-NonInteractive')
    expect(args.join(' ')).toContain('ValueFromRemainingArguments')
    expect(args.join(' ')).toContain('Get-NetTCPConnection')
    expect(args.join(' ')).toContain('Stop-Process')
    expect(processKiller).not.toHaveBeenCalled()
  })

  /** 证明命令执行失败会携带平台和端口上下文，并阻止启动继续。 */
  it('reports actionable context when listener cleanup fails', async () => {
    /** 模拟 lsof 工具缺失，验证错误不会被当作“无监听者”吞掉。 */
    const commandRunner: LocalRuntimeCommandRunner = vi.fn(async () => {
      throw Object.assign(new Error('spawn lsof ENOENT'), { code: 'ENOENT' })
    })

    await expect(releaseListeningPorts([
      { port: 4_855, label: 'PLC-Sim OPC UA' }
    ], {
      platform: 'darwin',
      commandRunner
    })).rejects.toThrow(
      'macOS 释放 PLC-Sim OPC UA 端口 4855 失败：spawn lsof ENOENT'
    )
  })

  /** 证明端口输入必须是有效 TCP 端口，避免把未校验值交给系统命令。 */
  it('rejects invalid ports before invoking a platform command', async () => {
    /** 记录非法输入是否意外触发了外部命令。 */
    const commandRunner: LocalRuntimeCommandRunner = vi.fn(async () => ({
      stdout: '',
      stderr: ''
    }))

    await expect(releaseListeningPorts([
      { port: 70_000, label: '非法端口' }
    ], {
      platform: 'darwin',
      commandRunner
    })).rejects.toThrow('非法端口不是有效 TCP 端口：70000')
    expect(commandRunner).not.toHaveBeenCalled()
  })
})
