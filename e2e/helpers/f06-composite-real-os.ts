import { spawn, type ChildProcess } from 'node:child_process'
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
  compositeChildWorkflowUuid: string
  compositeParentWorkflowUuid: string
  compositeInvocationUuid: string
  logs: () => string
  stop: () => Promise<void>
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
  const directory = mkdtempSync(join(tmpdir(), 'unilab-f06-composite-'))
  const workingDirectory = join(directory, 'unilabos_data')
  const editableRoot = join(directory, 'editable')
  const port = await availablePort()
  const url = `http://127.0.0.1:${port}`
  let output = ''
  const child = spawn(
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
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString()
  })
  try {
    await waitUntilReady(url, child, () => output)
  } catch (error) {
    await stopChild(child)
    rmSync(directory, { recursive: true, force: true })
    throw error
  }

  return {
    url,
    compositeChildWorkflowUuid: F06_CHILD_WORKFLOW_UUID,
    compositeParentWorkflowUuid: F06_PARENT_WORKFLOW_UUID,
    compositeInvocationUuid: F06_INVOCATION_UUID,
    logs: () => output,
    stop: async () => {
      await stopChild(child)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

const PYTHON_LAUNCHER = String.raw`
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from tests.registry.test_template_projection import (
    DEVICE_MATERIAL_UUID,
    FakeInventoryStore,
    FakeRegistry,
)
from unilabos.app.workflow_api import install_workflow_api
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
inventory_store = FakeInventoryStore()
reset_workflow_service_for_test()
service, projection = compose_local_workflow_template_runtime(
    working_dir,
    inventory_store=inventory_store,
    registry=FixtureRegistry(),
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

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Last-Event-ID"],
)
install_workflow_api(
    app,
    service,
    template_snapshot_provider=projection,
    authoring_transform=service.compiler,
)

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
 * 参数：`url` 是 OS 根地址，`child` 是进程，`logs` 返回累计日志。返回：服务
 * 就绪时无值。异常：进程退出或 60 秒超时时抛出包含日志的错误。
 */
async function waitUntilReady(
  url: string,
  child: ChildProcess,
  logs: () => string
): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
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
  if (child.exitCode !== null) return
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
