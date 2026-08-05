import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const F07_WORKFLOW_UUID =
  '71000000-0000-4000-8000-000000000001'

export interface F07TaskInputOs {
  url: string
  workflowUuid: string
  logs: () => string
  stop: () => Promise<void>
}

/** 启动当前产品候选的真实工作流服务和公共 v1 HTTP 接口。 */
export async function startF07TaskInputOs(): Promise<F07TaskInputOs> {
  const configuredRoot = process.env.UNILAB_F07_OS_ROOT
  if (!configuredRoot) {
    throw new Error('UNILAB_F07_OS_ROOT must identify the OS product candidate')
  }
  const osRepository = resolve(configuredRoot)
  const python = process.env.UNILAB_OS_PYTHON ||
    '/home/changjunhan/.micromamba/envs/unilab/bin/python'
  const directory = mkdtempSync(join(tmpdir(), 'unilab-f07-task-input-'))
  const port = await availablePort()
  const url = `http://127.0.0.1:${port}`
  let output = ''
  const child = spawn(
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
  child.stdout?.on('data', (chunk) => { output += chunk.toString() })
  child.stderr?.on('data', (chunk) => { output += chunk.toString() })
  try {
    await waitUntilReady(url, child, () => output)
  } catch (error) {
    await stopChild(child)
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
  return {
    url,
    workflowUuid: F07_WORKFLOW_UUID,
    logs: () => output,
    stop: async () => {
      await stopChild(child)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

/** 取得一个只供本测试进程独占的本机端口。 */
async function availablePort(): Promise<number> {
  return new Promise((accept, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('failed to allocate F07 OS port'))
        return
      }
      server.close((error) => error ? reject(error) : accept(address.port))
    })
  })
}

/** 等待工作流列表接口成功，进程提前退出时保留完整 OS 日志。 */
async function waitUntilReady(
  url: string,
  child: ChildProcess,
  logs: () => string
): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`F07 product OS exited with ${child.exitCode}\n${logs()}`)
    }
    try {
      const response = await fetch(`${url}/api/v1/workflows?page=1&page_size=10`)
      if (response.ok) return
    } catch {
      // 服务端口尚未监听；下一轮继续检查进程与 HTTP。
    }
    await new Promise((accept) => setTimeout(accept, 100))
  }
  throw new Error(`F07 product OS did not become ready\n${logs()}`)
}

/** 温和停止本测试启动的 OS，超时后只终止该明确子进程。 */
async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise<boolean>((accept) => child.once('exit', () => accept(true))),
    new Promise<boolean>((accept) => setTimeout(() => accept(false), 5_000))
  ])
  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise<void>((accept) => child.once('exit', () => accept()))
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
    """构造当前动作的标量目标或来源连接点（Handle）模板。"""
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
        """返回本进程唯一且不可变的创作目录快照。"""
        return catalog

app = create_workflow_app(
    service,
    template_snapshot_provider=SnapshotProvider(),
)
inventory_store = InventoryStore(str(root / "inventory.db"))
install_backend_resource_api(app, BackendResourceService(inventory_store))

@app.get("/api/v1/health")
def health():
    """返回前端连接策略要求的当前 OS 健康事实。"""
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
run(app, host="127.0.0.1", port=port, log_level="info")
`
