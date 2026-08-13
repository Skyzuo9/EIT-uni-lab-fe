import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createDiagnosticLogSessionId } from './diagnosticLogSession'
import { LocalRuntimeManager } from './localRuntimeManager'
import {
  cleanupLocalRuntimeTestArtifacts,
  createLocalRuntimeTestFixture,
  startTemporaryListener,
  writeFakeEdgeExecutable,
  writeFakeSimulatorExecutable
} from './localRuntimeManager.testSupport'

/** 清理当前用例创建的本地进程与临时目录。 */
afterEach(cleanupLocalRuntimeTestArtifacts)

/** 覆盖本地运行管理器的端口回收与进程生命周期。 */
describe('LocalRuntimeManager process lifecycle', () => {
  const logSessionId = createDiagnosticLogSessionId(
    new Date('2026-08-05T01:02:03.004Z')
  )

  /** 证明 PLC-Sim 启动只回收自己的两个端口，不干扰可并行运行的 Edge。 */
  it('reclaims an occupied PLC-Sim port before spawning the new process', async () => {
    const fixture = await createLocalRuntimeTestFixture('packages')
    await writeFakeSimulatorExecutable(fixture.python)
    const [simulatorGui, simulatorOpcUa] = await Promise.all([
      startTemporaryListener(),
      startTemporaryListener()
    ])

    const manager = new LocalRuntimeManager(
      join(dirname(fixture.osRoot), 'logs'),
      () => undefined,
      logSessionId,
      {
        edgeHttp: 18_003,
        hostLink: 18_004,
        simulatorGui: simulatorGui.port,
        simulatorOpcUa: simulatorOpcUa.port
      }
    )

    await expect(manager.startSimulator(fixture.config)).resolves.toMatchObject({
      phase: 'simulator_ready',
      simulatorRunning: true
    })
    await manager.stop()
  })

  /** 证明未选择 PLC-Sim 时，领域侧边缘执行（Edge）仍清理其两个端口。 */
  it('reclaims occupied Edge ports when launching Edge directly', async () => {
    const fixture = await createLocalRuntimeTestFixture('packages')
    await writeFakeEdgeExecutable(fixture.unilab)
    const [edgeHttp, hostLink] = await Promise.all([
      startTemporaryListener(),
      startTemporaryListener()
    ])
    const manager = new LocalRuntimeManager(
      join(dirname(fixture.osRoot), 'logs'),
      () => undefined,
      logSessionId,
      {
        edgeHttp: edgeHttp.port,
        hostLink: hostLink.port,
        simulatorGui: 18_765,
        simulatorOpcUa: 4_855
      }
    )

    await expect(manager.startEdge({
      ...fixture.config,
      szlabProjectPath: ''
    })).resolves.toMatchObject({
      phase: 'ready',
      edgeRunning: true,
      simulatorRunning: false
    })
    await manager.stop()
  })
})
