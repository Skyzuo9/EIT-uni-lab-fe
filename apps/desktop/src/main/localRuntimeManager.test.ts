import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalRuntimeLaunchConfig } from '../shared/localRuntime'
import {
  LocalRuntimeManager,
  type ManagedRuntimePort,
  readLocalRuntimeLogs,
  resolveLocalRuntimeLaunchPlan,
  resolveLocalSimulatorLaunchPlan
} from './localRuntimeManager'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, {
      recursive: true,
      force: true
    }))
  )
})

describe('LocalRuntimeManager command plan', () => {
  it('starts a workspace through the managed Runtime without Conda or OS source paths', async () => {
    const fixture = await createFixture('packages')
    const managedWorkingRoot = join(fixture.szlabRoot, 'managed-data')
    const startWorker = vi.fn(async () => ({
      status: 'running' as const,
      worker: { pid: 42 },
      error: null,
      simulator: { status: 'idle' as const, pid: null, error: null }
    }))
    const stopWorker = vi.fn(async () => ({
      status: 'idle' as const,
      worker: null,
      error: null,
      simulator: { status: 'idle' as const, pid: null, error: null }
    }))
    const managedRuntime: ManagedRuntimePort = {
      getModeInfo: async () => ({
        mode: 'managed',
        label: '内置 Runtime',
        runtimeVersion: '0.11.3'
      }),
      getRuntimePaths: vi.fn(),
      startWorker,
      stopWorker,
      startSimulator: vi.fn(),
      stopSimulator: vi.fn()
    }
    const manager = new LocalRuntimeManager(
      join(fixture.szlabRoot, 'logs'),
      vi.fn(),
      {
        managedRuntime,
        managedWorkingRoot,
        waitForEdgeReadiness: async () => undefined
      }
    )

    const snapshot = await manager.startEdge({
      ...fixture.config,
      osProjectPath: '',
      environmentPath: ''
    })

    expect(snapshot).toMatchObject({ phase: 'ready', edgeRunning: true })
    expect(startWorker).toHaveBeenCalledWith({
      workspacePath: fixture.szlabRoot,
      graphPath: fixture.graphPath,
      configPath: join(fixture.szlabRoot, 'deployment', 'local_config.py'),
      workingDirectory: expect.stringMatching(
        new RegExp(`^${managedWorkingRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      ),
      backend: 'ros'
    })

    await expect(manager.stopEdge()).resolves.toMatchObject({
      phase: 'idle',
      edgeRunning: false
    })
    expect(stopWorker).toHaveBeenCalledTimes(1)
  })

  it('lets the persistent Supervisor own a source PLC-Sim in managed mode', async () => {
    const fixture = await createFixture('packages')
    const startSimulator = vi.fn(async () => ({
      status: 'idle' as const,
      worker: null,
      error: null,
      simulator: { status: 'running' as const, pid: 84, error: null }
    }))
    const stopSimulator = vi.fn(async () => ({
      status: 'idle' as const,
      worker: null,
      error: null,
      simulator: { status: 'idle' as const, pid: null, error: null }
    }))
    const managedRuntime: ManagedRuntimePort = {
      getModeInfo: async () => ({
        mode: 'managed',
        label: '内置 Runtime',
        runtimeVersion: '0.11.3'
      }),
      getRuntimePaths: vi.fn(),
      startWorker: vi.fn(),
      stopWorker: vi.fn(),
      startSimulator,
      stopSimulator
    }
    const manager = new LocalRuntimeManager(
      join(fixture.szlabRoot, 'logs'),
      vi.fn(),
      { managedRuntime, waitForSimulatorReadiness: async () => undefined }
    )

    await expect(manager.startSimulator({
      ...fixture.config,
      environmentPath: ''
    })).resolves.toMatchObject({
      phase: 'simulator_ready',
      simulatorRunning: true
    })
    expect(startSimulator).toHaveBeenCalledWith({
      kind: 'source',
      path: fixture.simulatorRoot
    })

    await expect(manager.stopSimulator()).resolves.toMatchObject({
      phase: 'idle',
      simulatorRunning: false
    })
    expect(stopSimulator).toHaveBeenCalledTimes(1)
  })

  it('runs manual package acceptance and cleans up managed processes by default', async () => {
    const fixture = await createFixture('packages')
    const running = {
      status: 'running' as const,
      worker: { pid: 42 },
      error: null,
      simulator: { status: 'running' as const, pid: 84, error: null }
    }
    const stopped = {
      status: 'idle' as const,
      worker: null,
      error: null,
      simulator: { status: 'idle' as const, pid: null, error: null }
    }
    const stopWorker = vi.fn(async () => stopped)
    const stopSimulator = vi.fn(async () => stopped)
    const runAcceptance = vi.fn(async () => ({
      status: 'verified' as const,
      message: 'PLC-Sim 与设备包启动验收通过。',
      checkedAt: 1_785_499_200_000,
      descriptorPath: join(fixture.szlabRoot, 'unilab.acceptance.json'),
      packageName: 'plc-reference',
      packageVersion: '1.0.0'
    }))
    const manager = new LocalRuntimeManager(
      join(fixture.szlabRoot, 'logs'),
      vi.fn(),
      {
        managedRuntime: {
          getModeInfo: async () => ({
            mode: 'managed',
            label: '内置 Runtime',
            runtimeVersion: '0.11.3'
          }),
          getRuntimePaths: vi.fn(),
          startWorker: vi.fn(async () => running),
          stopWorker,
          startSimulator: vi.fn(async () => running),
          stopSimulator
        },
        waitForSimulatorReadiness: async () => undefined,
        waitForEdgeReadiness: async () => undefined,
        runAcceptance
      }
    )

    await manager.startSimulator(fixture.config)
    await manager.startEdge(fixture.config)
    await expect(manager.runAcceptance(fixture.config)).resolves.toMatchObject({
      phase: 'idle',
      simulatorRunning: false,
      edgeRunning: false,
      acceptance: { status: 'verified', packageName: 'plc-reference' }
    })
    expect(runAcceptance).toHaveBeenCalledWith(fixture.szlabRoot)
    expect(stopWorker).toHaveBeenCalledTimes(1)
    expect(stopSimulator).toHaveBeenCalledTimes(1)

    await manager.startEdge(fixture.config)
    expect(manager.getSnapshot().acceptance).toMatchObject({
      status: 'unverified'
    })
  })

  it('reads only the tail of fixed local runtime log files', async () => {
    const logsDirectory = await mkdtemp(join(tmpdir(), 'unilab-runtime-logs-'))
    temporaryDirectories.push(logsDirectory)
    await Promise.all([
      writeFile(join(logsDirectory, 'simulator.log'), 'old-prefix-latest'),
      writeFile(join(logsDirectory, 'edge.log'), '')
    ])

    const logs = await readLocalRuntimeLogs(logsDirectory, 6)

    expect(logs.entries).toEqual([
      {
        kind: 'simulator',
        content: 'latest',
        available: true,
        truncated: true
      },
      {
        kind: 'edge',
        content: '',
        available: true,
        truncated: false
      }
    ])
  })

  it('launches the selected workspace through the public ROS unilab CLI', async () => {
    const fixture = await createFixture('packages')
    const plan = await resolveLocalRuntimeLaunchPlan(fixture.config)
    const simulatorPlan = await resolveLocalSimulatorLaunchPlan(fixture.config)

    expect(simulatorPlan.simulator).toMatchObject({
      command: fixture.python,
      cwd: join(fixture.simulatorRoot, 'OpcUaSim'),
      args: [
        '-m',
        'gui.backend',
        '--host',
        '127.0.0.1',
        '--port',
        '18765'
      ]
    })
    expect(plan).not.toHaveProperty('bridge')
    expect(plan.edge.command).toBe(fixture.unilab)
    expect(plan.edge.cwd).toBe(fixture.szlabRoot)
    expect(plan.edge.args).toEqual([
      '--workspace',
      fixture.szlabRoot,
      '--graph',
      fixture.graphPath,
      '--config',
      join(fixture.szlabRoot, 'deployment', 'local_config.py'),
      '--working_dir',
      join(fixture.szlabRoot, 'runtime', 'ideawit-e2e'),
      '--backend',
      'ros',
      '--app_bridges',
      'fastapi',
      '--edge_scheduler',
      '--port',
      '18003',
      '--disable_browser',
      '--skip_env_check',
      '--test_mode'
    ])
    expect(plan.edge.env['ROS_DOMAIN_ID']).toBe('42')
    expect(plan.edge.env['UNILABOS_OBSERVABILITYCONFIG_ENABLED']).toBe('true')
    expect(plan.edge.env['UNILABOS_OBSERVABILITYCONFIG_PROJECT_NAME']).toBe(
      'uni-lab-electron'
    )
    expect(plan.edge.env['PYTHONUNBUFFERED']).toBe('1')
    expect(plan.edge.env['PATH']?.split(delimiter)[0]).toBe(
      join(fixture.config.environmentPath, 'bin')
    )
    expect(plan.edge.env['PYTHONPATH']?.split(delimiter).slice(0, 2)).toEqual([
      fixture.osRoot,
      fixture.szlabRoot
    ])
    const runtimeDatabase = plan.edge.env['UNILABOS_RUNTIME_DB']
    expect(runtimeDatabase).toBeDefined()
    expect(dirname(runtimeDatabase ?? '')).toBe(
      join(fixture.szlabRoot, 'runtime', 'ideawit-e2e')
    )
    expect(basename(runtimeDatabase ?? '')).toMatch(
      /^edge-runtime-\d{8}-\d{6}\.sqlite3$/
    )
  })

  it('supports the current root-level szlab_poly_studio layout', async () => {
    const fixture = await createFixture('root')
    const plan = await resolveLocalRuntimeLaunchPlan(fixture.config)

    expect(plan.edge.args).toContain('--workspace')
    expect(plan.edge.args).toContain(fixture.szlabRoot)
  })

  it('uses Windows Conda executables for PLC-Sim and Edge', async () => {
    const inheritedWindowsPath = 'C:\\Windows\\System32'
    vi.stubEnv('PATH', '')
    vi.stubEnv('Path', inheritedWindowsPath)
    const fixture = await createFixture('packages', 'win32')
    const plan = await resolveLocalRuntimeLaunchPlan(fixture.config, 'win32')
    const simulatorPlan = await resolveLocalSimulatorLaunchPlan(
      fixture.config,
      'win32'
    )

    expect(fixture.python).toBe(
      join(fixture.config.environmentPath, 'python.exe')
    )
    expect(fixture.unilab).toBe(
      join(fixture.config.environmentPath, 'Scripts', 'unilab.exe')
    )
    expect(fixture.config.environmentPath).toContain(
      'unilab windows runtime-'
    )
    expect(simulatorPlan.simulator.command).toBe(fixture.python)
    expect(plan.edge.command).toBe(fixture.unilab)
    expect(plan.edge.env['PYTHONPATH']?.split(';').slice(0, 2)).toEqual([
      fixture.osRoot,
      fixture.szlabRoot
    ])
    const activatedPath = [
      fixture.config.environmentPath,
      join(fixture.config.environmentPath, 'Library', 'mingw-w64', 'bin'),
      join(fixture.config.environmentPath, 'Library', 'usr', 'bin'),
      join(fixture.config.environmentPath, 'Library', 'bin'),
      join(fixture.config.environmentPath, 'Scripts'),
      join(fixture.config.environmentPath, 'bin')
    ]
    for (const spec of [simulatorPlan.simulator, plan.edge]) {
      expect(spec.env['CONDA_PREFIX']).toBe(fixture.config.environmentPath)
      expect(spec.env['CONDA_DEFAULT_ENV']).toBe(
        basename(fixture.config.environmentPath)
      )
      expect(spec.env['CONDA_SHLVL']).toBe('1')
      expect(spec.env['PATH']?.split(';').slice(0, activatedPath.length))
        .toEqual(activatedPath)
      expect(spec.env['PATH']?.split(';').at(-1)).toBe(inheritedWindowsPath)
      expect(Object.keys(spec.env).filter((key) => key.toLowerCase() === 'path'))
        .toEqual(['PATH'])
    }
  })

  it('resolves PLC-Sim without requiring Edge project paths', async () => {
    const fixture = await createFixture('packages')
    const plan = await resolveLocalSimulatorLaunchPlan({
      ...fixture.config,
      graphPath: '',
      osProjectPath: '',
      szlabProjectPath: ''
    })

    expect(plan.simulator.command).toBe(fixture.python)
    expect(plan.simulator.cwd).toBe(
      join(fixture.simulatorRoot, 'OpcUaSim')
    )
  })

  it('rejects a Conda environment without the expected executables', async () => {
    const fixture = await createFixture('packages')
    await rm(fixture.unilab)

    await expect(resolveLocalRuntimeLaunchPlan(fixture.config)).rejects.toThrow(
      '所选 Conda 环境缺少 bin/unilab'
    )
  })
})

async function createFixture(
  layout: 'packages' | 'root',
  platform: NodeJS.Platform = 'linux'
): Promise<{
  config: LocalRuntimeLaunchConfig
  graphPath: string
  osRoot: string
  python: string
  simulatorRoot: string
  szlabRoot: string
  unilab: string
}> {
  const fixturePrefix = platform === 'win32'
    ? 'unilab windows runtime-'
    : 'unilab-runtime-manager-'
  const root = await mkdtemp(join(tmpdir(), fixturePrefix))
  temporaryDirectories.push(root)
  const osRoot = join(root, 'Uni-Lab-OS')
  const szlabRoot = join(root, 'Uni-Lab-SZLab')
  const environmentRoot = join(root, 'envs', 'unilab')
  const simulatorRoot = join(root, 'PLC-Sim')
  const graphPath = join(szlabRoot, 'deployment', 'graphs', 'device.json')
  const python = platform === 'win32'
    ? join(environmentRoot, 'python.exe')
    : join(environmentRoot, 'bin', 'python')
  const unilab = platform === 'win32'
    ? join(environmentRoot, 'Scripts', 'unilab.exe')
    : join(environmentRoot, 'bin', 'unilab')

  await Promise.all([
    mkdir(osRoot, { recursive: true }),
    mkdir(join(szlabRoot, 'deployment', 'graphs'), { recursive: true }),
    mkdir(dirname(python), { recursive: true }),
    mkdir(dirname(unilab), { recursive: true }),
    mkdir(join(simulatorRoot, 'OpcUaSim', 'gui'), { recursive: true })
  ])
  await Promise.all([
    writeFile(graphPath, '{}'),
    writeFile(join(szlabRoot, 'deployment', 'local_config.py'), ''),
    writeFile(join(simulatorRoot, 'OpcUaSim', 'gui', 'backend.py'), ''),
    writeFile(python, ''),
    writeFile(unilab, '')
  ])
  await Promise.all([chmod(python, 0o755), chmod(unilab, 0o755)])

  if (layout === 'packages') {
    await mkdir(
      join(
        szlabRoot,
        'packages',
        'szlab_poly_studio',
        'szlab_poly_studio'
      ),
      { recursive: true }
    )
    await writeFile(
      join(szlabRoot, 'packages', 'szlab_poly_studio', 'package.yaml'),
      ''
    )
  } else {
    await mkdir(
      join(szlabRoot, 'szlab_poly_studio', 'profiles', 'default'),
      { recursive: true }
    )
    await writeFile(
      join(
        szlabRoot,
        'szlab_poly_studio',
        'profiles',
        'default',
        'package.yaml'
      ),
      ''
    )
  }

  return {
    config: {
      graphPath,
      osProjectPath: osRoot,
      szlabProjectPath: szlabRoot,
      environmentPath: environmentRoot,
      simulatorProjectPath: simulatorRoot
    },
    graphPath,
    osRoot,
    python,
    simulatorRoot,
    szlabRoot,
    unilab
  }
}
