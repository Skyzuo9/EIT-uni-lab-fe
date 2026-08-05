import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const F07_WORKFLOW_UUID =
  '71000000-0000-4000-8000-000000000001'

export interface F07TaskInputOs {
  url: string
  workflowUuid: string
  logs: () => string
  stop: () => Promise<void>
}

/**
 * 启动当前产品候选的真实工作流服务和公共 v1 HTTP 接口。
 *
 * 参数：无；`UNILAB_F07_OS_ROOT` 必须指向干净的 OS 候选，Python 可由
 * `UNILAB_OS_PYTHON` 覆盖。返回：供浏览器调用、读取日志和显式关闭的句柄。
 * 异常：缺少候选路径、端口分配、进程启动或就绪探测失败时拒绝 Promise；凡已
 * 创建的子进程和临时目录都在失败路径回收。
 */
export async function startF07TaskInputOs(): Promise<F07TaskInputOs> {
  const configuredRoot = process.env.UNILAB_F07_OS_ROOT
  if (!configuredRoot) {
    throw new Error('UNILAB_F07_OS_ROOT must identify the OS product candidate')
  }
  const osRepository = resolve(configuredRoot)
  const python = process.env.UNILAB_OS_PYTHON ||
    '/home/changjunhan/.micromamba/envs/unilab/bin/python'
  const port = await availablePort()
  const directory = mkdtempSync(join(tmpdir(), 'unilab-f07-task-input-'))
  const url = `http://127.0.0.1:${port}`
  let output = ''
  let child: ChildProcess
  try {
    child = spawn(
      python,
      ['-c', PYTHON_LAUNCHER, directory, String(port)],
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
   * 参数：`error` 是 Node.js 报告的进程启动错误。返回：记录日志后无值。
   * 异常：不抛异常。
   */
  const recordSpawnError = (error: Error): void => {
    spawnError = error
    output += `${error.stack ?? error.message}\n`
  }
  /**
   * 读取 OS 异步启动错误。
   *
   * 参数：无。返回：尚未失败时为空，否则返回原始错误。异常：不抛异常。
   */
  const readSpawnError = (): Error | undefined => spawnError
  /**
   * 追加一个 OS 输出块。
   *
   * 参数：`chunk` 是标准输出或标准错误块。返回：追加后无值。异常：不抛异常。
   */
  const appendOutput = (chunk: Buffer): void => {
    output += chunk.toString()
  }
  child.once('error', recordSpawnError)
  child.stdout?.on('data', appendOutput)
  child.stderr?.on('data', appendOutput)
  /**
   * 返回当前 OS 累计日志。
   *
   * 参数：无。返回：标准输出与标准错误的累计文本。异常：不抛异常。
   */
  const logs = (): string => output
  try {
    await waitUntilReady(url, child, logs, readSpawnError)
  } catch (error) {
    try {
      await stopChild(child)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
    throw error
  }
  /**
   * 停止唯一 OS 子进程并删除隔离目录。
   *
   * 参数：无。返回：清理完成后无值。异常：进程终止失败时拒绝 Promise，但目录
   * 仍在 `finally` 中删除。
   */
  const stop = async (): Promise<void> => {
    try {
      await stopChild(child)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  return {
    url,
    workflowUuid: F07_WORKFLOW_UUID,
    logs,
    stop
  }
}

/**
 * 取得一个只供本测试进程独占的本机端口。
 *
 * 参数：无。返回：占位监听关闭后可供 OS 使用的回环 TCP 端口。异常：监听、
 * 地址读取或关闭失败时拒绝 Promise。
 */
async function availablePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('failed to allocate F07 OS port')
  }
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

/**
 * 等待工作流列表接口成功，进程提前退出时保留完整 OS 日志。
 *
 * 参数：`url` 是 OS 根地址；`child` 是被观察进程；`logs` 返回累计日志；
 * `spawnError` 返回异步启动错误。返回：服务就绪时无值。异常：启动错误、进程
 * 退出或 30 秒超时时抛出包含诊断的错误。
 */
async function waitUntilReady(
  url: string,
  child: ChildProcess,
  logs: () => string,
  spawnError: () => Error | undefined
): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const startupFailure = spawnError()
    if (startupFailure) throw startupFailure
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `F07 product OS exited with ${child.exitCode ?? child.signalCode}\n${logs()}`
      )
    }
    try {
      const response = await fetch(`${url}/api/v1/workflows?page=1&page_size=10`)
      if (response.ok) return
    } catch {
      // 服务端口尚未监听；下一轮继续检查进程与 HTTP。
    }
    await delay(100)
  }
  throw new Error(`F07 product OS did not become ready\n${logs()}`)
}

/**
 * 温和停止本测试启动的 OS，超时后只终止该明确子进程。
 *
 * 参数：`child` 是待回收的唯一 OS 进程。返回：进程退出后无值。异常：终止
 * 信号发送或退出等待失败时拒绝 Promise。
 */
async function stopChild(child: ChildProcess): Promise<void> {
  if (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  ) return
  child.kill('SIGTERM')
  await Promise.race([once(child, 'exit'), delay(5_000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

const PYTHON_LAUNCHER = String.raw`
import sys
from pathlib import Path

from fastapi.middleware.cors import CORSMiddleware
from uvicorn import run

from unilabos.app.workflow_api import create_workflow_app
from unilabos.app.scheduler.inventory import InventoryStore
from unilabos.app.scheduler.inventory.backend_api import install_backend_resource_api
from unilabos.app.scheduler.inventory.backend_contract import BackendResourceService
from unilabos.workflow.authoring_engine import WorkflowAuthoringEngine
from unilabos.workflow.authoring_kernel import AuthoringCatalogSnapshot
from unilabos.workflow.composition import compose_workflow_runtime
from unilabos.workflow.service import WorkflowService
from unilabos.workflow.store import WorkflowStore

WORKFLOW_UUID = "${F07_WORKFLOW_UUID}"
TEMPLATE_UUID = "72000000-0000-4000-8000-000000000001"
RESOURCE_TEMPLATE_UUID = "73000000-0000-4000-8000-000000000001"
TARGET_HANDLE_UUID = "74000000-0000-4000-8000-000000000001"
SOURCE_HANDLE_UUID = "74000000-0000-4000-8000-000000000002"
NODE_UUID = "75000000-0000-4000-8000-000000000001"

root = Path(sys.argv[1])
port = int(sys.argv[2])
working_dir = root / "unilabos_data"
editable_root = root / "editable"
source_path = editable_root / "f07_lab" / "workflows" / "scalar.py"
source_path.parent.mkdir(parents=True, exist_ok=True)
source_path.write_text(
    f'''from lab.devices import Reactor
from unilabos.workflow.authoring import device, workflow, workflow_output

reactor: Reactor = device()

@workflow(
    workflow_uuid="{WORKFLOW_UUID}",
    displayname="F07 scalar task input",
    description="Current product candidate task input gate.",
)
def scalar_task(*, label: str, count: int, enabled: bool, attempts: int = 3):
    """把一次标量工作流任务（WorkflowTask）输入绑定到唯一动作。

    参数：label、count、enabled 是三类必填标量，attempts 验证默认值解析。
    返回：动作 report 的公开工作流输出。异常：参数规范化和动作合同错误由真实
    OS 编译或任务创建路径失败关闭；夹具本身不发送物理动作。
    """
    # unilab:node_uuid={NODE_UUID}
    done = reactor.finalize(report=label)
    return workflow_output(report=done.report)
''',
    encoding="utf-8",
)
(editable_root / "package.yaml").write_text(
    "\n".join([
        "package:",
        "  name: f07_lab",
        "",
        "workflows:",
        f"  - workflow_uuid: {WORKFLOW_UUID}",
        "    source: f07_lab/workflows/scalar.py",
        "",
    ]),
    encoding="utf-8",
)
working_dir.mkdir(parents=True, exist_ok=True)
store = WorkflowStore(working_dir / "workflow_history.db")
try:
    WorkflowService(store).create_workflow(
        name="F07 scalar task input",
        tags=[],
        description="Current product candidate task input gate.",
        meta_data={},
        workflow_uuid=WORKFLOW_UUID,
    )
finally:
    store.close()

template = {
    "uuid": TEMPLATE_UUID,
    "resource_template_uuid": RESOURCE_TEMPLATE_UUID,
    "name": "finalize",
    "display_name": "Finalize",
    "class": "lab.devices:Reactor",
    "description": "F07 scalar action",
    "meta_data": {},
    "goal": {},
    "goal_default": {},
    "feedback": {},
    "result": {},
    "schema": None,
    "type": "action",
    "node_type": "compute",
    "icon": None,
    "header": None,
    "footer": None,
}

def handle(identity, io_type):
    """构造当前动作的标量目标或来源连接点（Handle）模板。

    参数：identity 是固定连接点 UUID，io_type 是 target 或 source。返回：
    可进入创作目录快照的连接点实体。异常：本固定夹具不抛
    异常，非法方向会在真实目录构造时失败关闭。
    """
    return {
        "uuid": identity,
        "workflow_node_template_uuid": TEMPLATE_UUID,
        "handle_key": "report",
        "io_type": io_type,
        "display_name": "Report",
        "description": "F07 scalar report",
        "type": "string",
        "required": io_type == "target",
        "data_source": "executor",
        "data_key": "report",
        "meta_data": {"unilab": {"value_schema": {"type": "string"}}},
    }

catalog = AuthoringCatalogSnapshot.from_entities(
    [template],
    [handle(TARGET_HANDLE_UUID, "target"), handle(SOURCE_HANDLE_UUID, "source")],
    resource_template_symbols={"lab.devices:Reactor": RESOURCE_TEMPLATE_UUID},
)
compiler = WorkflowAuthoringEngine(catalog=catalog)
service = compose_workflow_runtime(
    working_dir,
    compiler=compiler,
    editable_package_roots=(editable_root,),
)
authoring = service.get_authoring(WORKFLOW_UUID)
candidate = authoring.get("candidate")
if candidate is None:
    raise RuntimeError(f"F07 fixture has no candidate: {authoring}")
service.apply_authoring(
    WORKFLOW_UUID,
    candidate_hash=candidate["candidate_hash"],
)

class SnapshotProvider:
    def snapshot(self):
        """返回本进程唯一且不可变的创作目录快照。

        参数：除实例自身外无。返回：启动时构造的创作目录快照。异常：不抛
        异常，且不在请求期间重新扫描或改写目录。
        """
        return catalog

app = create_workflow_app(
    service,
    template_snapshot_provider=SnapshotProvider(),
)
inventory_store = InventoryStore(str(root / "inventory.db"))
install_backend_resource_api(app, BackendResourceService(inventory_store))

@app.get("/api/v1/health")
def health():
    """返回前端连接策略要求的当前 OS 健康事实。

    参数：无。返回：只读健康状态对象。异常：不写工作流任务（WorkflowTask）、
    工作流节点作业（WorkflowNodeJob）或库存事实。
    """
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
run(app, host="127.0.0.1", port=port, log_level="info")
`
