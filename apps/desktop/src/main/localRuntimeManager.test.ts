import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { LocalRuntimeLaunchConfig } from '../shared/localRuntime'
import { resolveLocalRuntimeLaunchPlan } from './localRuntimeManager'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, {
      recursive: true,
      force: true
    }))
  )
})

describe('LocalRuntimeManager command plan', () => {
  it('maps the selected roots to the supplied OPC, Bridge and Edge commands', async () => {
    const fixture = await createFixture('packages')
    const plan = await resolveLocalRuntimeLaunchPlan(fixture.config)

    expect(plan.simulator).toMatchObject({
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
    expect(plan.bridge).toMatchObject({
      command: fixture.python,
      cwd: fixture.szlabRoot,
      args: [
        join(fixture.szlabRoot, 'deployment', 'local_bridge_entrypoint.py'),
        '--host',
        '127.0.0.1',
        '--schedule-port',
        '8892',
        '--api-port',
        '8014',
        '--execution-http-url',
        'http://127.0.0.1:18003',
        '--journal-path',
        join('runtime', 'ideawit-e2e', 'quick-debug.sqlite3'),
        '--profile',
        join(
          fixture.szlabRoot,
          'packages',
          'szlab_poly_studio',
          'package.yaml'
        )
      ]
    })
    expect(plan.edge.command).toBe(fixture.unilab)
    expect(plan.edge.cwd).toBe(fixture.szlabRoot)
    expect(plan.edge.args).toEqual([
      '--graph',
      fixture.graphPath,
      '--config',
      join(fixture.szlabRoot, 'deployment', 'local_config.py'),
      '--working_dir',
      join(fixture.szlabRoot, 'runtime', 'ideawit-e2e'),
      '--devices',
      join(
        fixture.szlabRoot,
        'packages',
        'szlab_poly_studio',
        'szlab_poly_studio'
      ),
      '--external_devices_only',
      '--backend',
      'ros',
      '--app_bridges',
      'websocket',
      'fastapi',
      '--port',
      '18003',
      '--schedule_addr',
      'ws://127.0.0.1:8892/api/v1/ws/schedule',
      '--disable_browser',
      '--skip_env_check'
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
      join(fixture.szlabRoot, 'packages', 'szlab_poly_studio')
    ])
    const runtimeDatabase = plan.edge.env['UNILABOS_RUNTIME_DB']
    expect(runtimeDatabase).toBeDefined()
    expect(dirname(runtimeDatabase ?? '')).toBe(
      join(fixture.szlabRoot, 'runtime', 'ideawit-e2e')
    )
    expect(basename(runtimeDatabase ?? '')).toMatch(
      /^edge-runtime-\d{8}-\d{6}\.sqlite3$/
    )
    expect(plan.bridge.env['PYTHONUNBUFFERED']).toBe('1')
    expect(plan.bridge.env['PYTHONPATH']?.split(delimiter).slice(0, 2)).toEqual([
      fixture.osRoot,
      join(fixture.szlabRoot, 'packages', 'szlab_poly_studio')
    ])
  })

  it('supports the current root-level szlab_poly_studio layout without OPC', async () => {
    const fixture = await createFixture('root')
    const plan = await resolveLocalRuntimeLaunchPlan({
      ...fixture.config,
      simulatorProjectPath: '',
      startSimulator: false
    })

    expect(plan.simulator).toBeUndefined()
    expect(plan.bridge.args).toContain(
      join(
        fixture.szlabRoot,
        'szlab_poly_studio',
        'profiles',
        'default',
        'package.yaml'
      )
    )
    expect(plan.edge.args).toContain(
      join(fixture.szlabRoot, 'szlab_poly_studio')
    )
  })

  it('rejects a Conda environment without the expected executables', async () => {
    const fixture = await createFixture('packages')
    await rm(fixture.python)

    await expect(resolveLocalRuntimeLaunchPlan(fixture.config)).rejects.toThrow(
      '所选 Conda 环境缺少 bin/python'
    )
  })
})

async function createFixture(
  layout: 'packages' | 'root'
): Promise<{
  config: LocalRuntimeLaunchConfig
  graphPath: string
  osRoot: string
  python: string
  simulatorRoot: string
  szlabRoot: string
  unilab: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'unilab-runtime-manager-'))
  temporaryDirectories.push(root)
  const osRoot = join(root, 'Uni-Lab-OS')
  const szlabRoot = join(root, 'Uni-Lab-SZLab')
  const environmentRoot = join(root, 'envs', 'unilab')
  const simulatorRoot = join(root, 'PLC-Sim')
  const graphPath = join(szlabRoot, 'deployment', 'graphs', 'device.json')
  const python = join(environmentRoot, 'bin', 'python')
  const unilab = join(environmentRoot, 'bin', 'unilab')

  await Promise.all([
    mkdir(osRoot, { recursive: true }),
    mkdir(join(szlabRoot, 'deployment', 'graphs'), { recursive: true }),
    mkdir(join(environmentRoot, 'bin'), { recursive: true }),
    mkdir(join(simulatorRoot, 'OpcUaSim', 'gui'), { recursive: true })
  ])
  await Promise.all([
    writeFile(graphPath, '{}'),
    writeFile(join(szlabRoot, 'deployment', 'local_bridge_entrypoint.py'), ''),
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
      simulatorProjectPath: simulatorRoot,
      startSimulator: true
    },
    graphPath,
    osRoot,
    python,
    simulatorRoot,
    szlabRoot,
    unilab
  }
}
