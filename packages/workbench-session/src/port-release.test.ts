import { describe, expect, it, vi } from 'vitest'

import {
  releaseLoopbackPorts,
  type PortReleaseCommandRunner
} from './port-release'

describe('releaseLoopbackPorts', () => {
  it('uses the native Windows listener query and excludes Workbench itself', async () => {
    const commandRunner: PortReleaseCommandRunner = vi.fn(async () => ({
      stdout: '51\r\n52\r\n51\r\n999\r\n',
      stderr: ''
    }))

    await expect(releaseLoopbackPorts([18_003, 18_004, 18_003], {
      platform: 'win32',
      commandRunner,
      currentProcessId: 999
    })).resolves.toEqual([51, 52])

    const [command, args] = vi.mocked(commandRunner).mock.calls[0]
    expect(command).toBe('powershell.exe')
    expect(args.slice(-3)).toEqual(['999', '18003', '18004'])
    expect(args).toContain('-NoProfile')
    expect(args).toContain('-NonInteractive')
    expect(args.join(' ')).toContain('Get-NetTCPConnection')
    expect(args.join(' ')).toContain('Stop-Process')
  })

  it('keeps the macOS lsof behavior and deduplicates listener processes', async () => {
    const commandRunner: PortReleaseCommandRunner = vi.fn(
      async (_command, args) => ({
        stdout: args.includes('-iTCP:18765') ? '41\n42\n' : '41\n',
        stderr: ''
      })
    )
    const processKiller = vi.fn<(pid: number, signal: NodeJS.Signals) => void>()

    await expect(releaseLoopbackPorts([18_765, 4_855], {
      platform: 'darwin',
      commandRunner,
      processKiller,
      currentProcessId: 999
    })).resolves.toEqual([41, 42])
    expect(processKiller).toHaveBeenCalledTimes(2)
    expect(processKiller).toHaveBeenCalledWith(41, 'SIGKILL')
    expect(processKiller).toHaveBeenCalledWith(42, 'SIGKILL')
  })

  it('reports a Windows command failure with the selected ports', async () => {
    const commandRunner: PortReleaseCommandRunner = vi.fn(async () => {
      throw new Error('access denied')
    })
    await expect(releaseLoopbackPorts([4_855], {
      platform: 'win32',
      commandRunner
    })).rejects.toThrow('Windows 释放端口 4855 失败：access denied')
  })
})
