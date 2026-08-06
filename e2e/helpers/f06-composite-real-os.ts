import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const F06_CHILD_WORKFLOW_UUID =
  '10000000-0000-4000-8000-000000000006'
export const F06_PARENT_WORKFLOW_UUID =
  '10000000-0000-4000-8000-000000000007'
export const F06_INVOCATION_UUID =
  '20000000-0000-4000-8000-000000000062'

export interface F06CompositeRealOs {
  url: string
  osRevision: GitRevisionEvidence
  compositeChildWorkflowUuid: string
  compositeParentWorkflowUuid: string
  compositeInvocationUuid: string
  logs: () => string
  stop: () => Promise<void>
}

/** 干净 Git 源码候选的可复核身份。 */
export interface GitRevisionEvidence {
  sha: string
  dirty: false
}

/**
 * 读取并锁定一个源码候选的 Git 身份。
 *
 * @param repository 待验收的仓库或工作树根目录。
 * @param label 错误消息中的中文候选名称。
 * @returns 当前完整提交 SHA 与固定的干净状态。
 * @throws Git 查询失败或工作树存在修改/未跟踪文件时抛出异常。
 */
export function readCleanGitRevision(
  repository: string,
  label: string
): GitRevisionEvidence {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8'
  }).trim()
  const status = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    { cwd: repository, encoding: 'utf8' }
  ).trim()
  if (status) {
    throw new Error(`${label}工作树不是干净候选:\n${status}`)
  }
  return { sha, dirty: false }
}

/**
 * 启动绑定当前候选 OS 生产组合根的 F06 组合工作流真实 HTTP 夹具。
 *
 * 参数：无；OS 根目录和 Python 可分别由 `UNILAB_AUTHORING_OS_ROOT`、
 * `UNILAB_OS_PYTHON` 覆盖。返回：可供 Playwright 使用和关闭的进程句柄。
 * 异常：端口分配、OS 启动或就绪探测失败时拒绝 Promise，并回收临时目录。
 */
export async function startF06CompositeRealOs(): Promise<F06CompositeRealOs> {
  const osRepository = resolve(
    process.env.UNILAB_AUTHORING_OS_ROOT ||
      '/home/changjunhan/Uni-Lab-Core/.worktrees/uni-lab-os-f06-r1-published-workflow-contract'
  )
  const python =
    process.env.UNILAB_OS_PYTHON ||
    '/home/changjunhan/.micromamba/envs/unilab/bin/python'
  const osRevision = readCleanGitRevision(osRepository, 'OS ')
  const port = await availablePort()
  const directory = mkdtempSync(join(tmpdir(), 'unilab-f06-composite-'))
  const workingDirectory = join(directory, 'unilabos_data')
  const editableRoot = join(directory, 'editable')
  const url = `http://127.0.0.1:${port}`
  let output = ''
  let child: ChildProcess
  try {
    child = spawn(
      python,
      ['-c', PYTHON_LAUNCHER, workingDirectory, editableRoot, String(port)],
      {
        cwd: osRepository,
        env: {
          ...process.env,
          PYTHONPATH: osRepository,
          PYTHONUNBUFFERED: '1'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
  let spawnError: Error | undefined
  /**
   * 保存 OS 异步启动错误，供就绪循环立即失败关闭。
   *
   * @param error Node.js 报告的进程启动错误。
   * @returns 错误完成落盘后返回无。
   * @throws 不抛异常。
   */
  const recordSpawnError = (error: Error): void => {
    spawnError = error
    output += `${error.stack ?? error.message}\n`
  }
  /**
   * 读取可能发生的 OS 异步启动错误。
   *
   * @returns 尚未失败时为空，否则返回原始启动错误。
   * @throws 不抛异常。
   */
  const readSpawnError = (): Error | undefined => spawnError
  child.once('error', recordSpawnError)
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString()
  })
  try {
    await waitUntilReady(url, child, () => output, readSpawnError)
  } catch (error) {
    await stopChild(child)
    rmSync(directory, { recursive: true, force: true })
    throw error
  }

  return {
    url,
    osRevision,
    compositeChildWorkflowUuid: F06_CHILD_WORKFLOW_UUID,
    compositeParentWorkflowUuid: F06_PARENT_WORKFLOW_UUID,
    compositeInvocationUuid: F06_INVOCATION_UUID,
    logs: () => output,
    stop: async () => {
      try {
        await stopChild(child)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  }
}

const PYTHON_LAUNCHER = String.raw`
import sys
from pathlib import Path

from tests.registry.test_template_projection import (
    DEVICE_MATERIAL_UUID,
    FakeRegistry,
    RESOURCE_TEMPLATE_UUID,
)
from unilabos.app.scheduler.integration import (
    get_edge_scheduler,
    setup_edge_inventory,
    setup_edge_scheduler,
)
from unilabos.config.config import BasicConfig
from unilabos.workflow.composition import (
    compose_local_workflow_template_runtime,
    reset_workflow_service_for_test,
)

working_dir = Path(sys.argv[1])
editable_root = Path(sys.argv[2])
port = int(sys.argv[3])
package_root = editable_root / "production_lab"
workflow_root = package_root / "workflows"
child_path = workflow_root / "composite_child.py"
parent_path = workflow_root / "composite_parent.py"
child_workflow_uuid = "${F06_CHILD_WORKFLOW_UUID}"
parent_workflow_uuid = "${F06_PARENT_WORKFLOW_UUID}"
invocation_uuid = "${F06_INVOCATION_UUID}"


class FixtureRegistry:
    """为真实模板投影提供泵动作与宿主节点定义。"""

    def obtain_registry_device_info(self):
        """返回可执行泵与框架宿主；参数无，返回完整设备定义，异常无。"""

        devices = FakeRegistry().obtain_registry_device_info()
        devices.append(
            {
                "id": "host_node",
                "display_name": "Host Node",
                "registry_type": "device",
                "class": {
                    "module": "unilabos.ros.nodes.presets.host_node:HostNode",
                    "type": "python",
                    "action_value_mappings": {},
                },
                "handles": [],
                "category": [],
            }
        )
        return devices

    def obtain_registry_resource_info(self):
        """返回空器材目录；参数无，返回空列表，异常无。"""

        return []


workflow_root.mkdir(parents=True, exist_ok=True)
child_path.write_text(
    f'''from lab.devices import Pump
from unilabos.workflow.authoring import device, workflow, workflow_output


pump: Pump = device("{DEVICE_MATERIAL_UUID}")


@workflow(
    workflow_uuid="{child_workflow_uuid}",
    displayname="F06 Published child",
)
def published_child(*, value: float):
    # unilab:node_uuid=20000000-0000-4000-8000-000000000061
    completed = pump.transfer(volume=value)
    return workflow_output(result=completed.accepted)
''',
    encoding="utf-8",
)
parent_path.write_text(
    f'''from lab.devices import Pump
from production_lab.workflows.composite_child import published_child
from unilabos.workflow.authoring import device, workflow, workflow_output


pump: Pump = device("{DEVICE_MATERIAL_UUID}")


@workflow(
    workflow_uuid="{parent_workflow_uuid}",
    displayname="F06 Composite parent",
)
def composite_parent():
    # unilab:node_uuid=20000000-0000-4000-8000-000000000063
    prepared = pump.transfer(volume=1.0)
    # unilab:node_uuid={invocation_uuid}
    child = published_child(value=1.0)
    # unilab:node_uuid=20000000-0000-4000-8000-000000000064
    finalized = pump.transfer(volume=1.0)
    return workflow_output(report=finalized.accepted)
''',
    encoding="utf-8",
)
editable_root.mkdir(parents=True, exist_ok=True)
(editable_root / "package.yaml").write_text(
    "\n".join(
        [
            "package:",
            "  name: production_lab",
            "",
            "workflows:",
            f"  - workflow_uuid: {child_workflow_uuid}",
            "    source: production_lab/workflows/composite_child.py",
            f"  - workflow_uuid: {parent_workflow_uuid}",
            "    source: production_lab/workflows/composite_parent.py",
            "",
        ]
    ),
    encoding="utf-8",
)
working_dir.mkdir(parents=True, exist_ok=True)
BasicConfig.working_dir = str(working_dir)
BasicConfig.workflow_editable_package_roots = (editable_root,)
inventory_service = setup_edge_inventory(str(working_dir / "inventory.db"))
with inventory_service.store.transaction() as connection:
    connection.execute(
        """
        INSERT INTO resource_template(
            uuid, create_time, update_time, name, display_name,
            resource_type, module
        ) VALUES (?,?,?,?,?,?,?)
        """,
        (
            RESOURCE_TEMPLATE_UUID,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
            "pump",
            "注射泵",
            "device",
            "lab.devices:Pump",
        ),
    )
    connection.execute(
        """
        INSERT INTO resource_template_inventory(
            resource_template_uuid, aggregate_version
        ) VALUES (?,1)
        """,
        (RESOURCE_TEMPLATE_UUID,),
    )
    connection.execute(
        """
        INSERT INTO material(
            uuid, create_time, update_time, meta_data,
            resource_template_uuid, class, barcode, name
        ) VALUES (?,?,?,?,?,?,?,?)
        """,
        (
            DEVICE_MATERIAL_UUID,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
            '{"edge_local_id":"pump-01"}',
            RESOURCE_TEMPLATE_UUID,
            "device",
            "",
            "pump-01",
        ),
    )
    connection.execute(
        """
        INSERT INTO material_inventory(material_uuid, aggregate_version)
        VALUES (?,1)
        """,
        (DEVICE_MATERIAL_UUID,),
    )
setup_edge_scheduler(
    device_state_db_path="off",
    workflow_history_db_path="off",
)
reset_workflow_service_for_test()
service, _projection = compose_local_workflow_template_runtime(
    working_dir,
    inventory_store=inventory_service.store,
    registry=FixtureRegistry(),
    scheduler=get_edge_scheduler(),
    editable_package_roots=(editable_root,),
)

def apply_fixture(workflow_uuid, source_path):
    """编译并应用夹具；参数是身份与路径，返回应用聚合，异常原样传播。"""

    before = service.get_authoring(workflow_uuid)
    aggregate = service.save_draft(
        workflow_uuid,
        python_source=source_path.read_text(encoding="utf-8"),
        expected_draft_hash=before["draft"]["draft_hash"],
        expected_workflow_revision=before["workflow_revision"],
    )
    candidate = aggregate["candidate"]
    if candidate is None:
        raise RuntimeError(aggregate)
    normalized_source = candidate["normalized_python_source"]
    if aggregate["draft"]["python_source"] != normalized_source:
        aggregate = service.save_draft(
            workflow_uuid,
            python_source=normalized_source,
            expected_draft_hash=aggregate["draft"]["draft_hash"],
            expected_workflow_revision=aggregate["workflow_revision"],
        )
        candidate = aggregate["candidate"]
        if candidate is None:
            raise RuntimeError(aggregate)
    result = service.apply_authoring(
        workflow_uuid,
        candidate_hash=candidate["candidate_hash"],
    )
    source_path.write_text(normalized_source, encoding="utf-8")
    return result


apply_fixture(child_workflow_uuid, child_path)
apply_fixture(parent_workflow_uuid, parent_path)

from unilabos.app.web import server

app = server.setup_server()

import uvicorn

uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
`

/**
 * 申请一个只绑定回环地址的临时 TCP 端口。
 *
 * 参数：无。返回：监听器关闭后可供 OS 使用的端口号。异常：监听或地址读取失败
 * 时拒绝 Promise。
 */
async function availablePort(): Promise<number> {
  return await new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rejectPort(new Error('Unable to reserve F06 OS port'))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) rejectPort(error)
        else resolvePort(port)
      })
    })
  })
}

/**
 * 等待工作流列表接口可读或子进程提前退出。
 *
 * 参数：`url` 是 OS 根地址，`child` 是进程，`logs` 返回累计日志，
 * `spawnError` 返回异步启动错误。返回：服务就绪时无值。异常：启动错误、进程
 * 退出或 60 秒超时时抛出包含日志的错误。
 */
async function waitUntilReady(
  url: string,
  child: ChildProcess,
  logs: () => string,
  spawnError: () => Error | undefined
): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const startupFailure = spawnError()
    if (startupFailure) throw startupFailure
    if (child.exitCode !== null) {
      throw new Error(`F06 OS exited with ${child.exitCode}\n${logs()}`)
    }
    try {
      const response = await fetch(`${url}/api/v1/workflows?page=1&page_size=1`)
      if (response.ok) return
    } catch {
      // 进程尚未监听；继续探测同一真实接口。
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`F06 OS did not become ready\n${logs()}`)
}

/**
 * 终止 OS 子进程并等待退出，必要时升级为强制终止。
 *
 * 参数：`child` 是待回收进程。返回：进程退出后无值。异常：终止信号发送或等待
 * 失败时拒绝 Promise。
 */
async function stopChild(child: ChildProcess): Promise<void> {
  if (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  ) return
  await new Promise<void>((resolveStop, rejectStop) => {
    const forceTimer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('error', (error) => {
      clearTimeout(forceTimer)
      rejectStop(error)
    })
    child.once('exit', () => {
      clearTimeout(forceTimer)
      resolveStop()
    })
    child.kill('SIGTERM')
  })
}
