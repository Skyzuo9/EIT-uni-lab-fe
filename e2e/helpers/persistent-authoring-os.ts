import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

export const AUTHORING_WORKFLOW_UUID =
  '10000000-0000-4000-8000-000000000001'

export interface PersistentAuthoringOs {
  url: string
  workflowUuid: string
  sourcePath: string
  logs: () => string
  stop: () => Promise<void>
}

export async function startPersistentAuthoringOs(): Promise<PersistentAuthoringOs> {
  const osRepository = resolve(
    process.env.UNILAB_AUTHORING_OS_ROOT ||
      '/home/gaojing/.worktrees/uni-lab-os-runtime-integration-final'
  )
  const python =
    process.env.UNILAB_OS_PYTHON ||
    '/home/changjunhan/.micromamba/envs/unilab/bin/python'
  const directory = mkdtempSync(join(tmpdir(), 'unilab-authoring-os-'))
  const workingDirectory = join(directory, 'unilabos_data')
  const editableRoot = join(directory, 'editable')
  const sourcePath = join(
    editableRoot,
    'production_lab',
    'workflows',
    'demo.py'
  )
  const port = await availablePort()
  const url = `http://127.0.0.1:${port}`
  const child = spawn(
    python,
    [
      '-c',
      PYTHON_LAUNCHER,
      workingDirectory,
      editableRoot,
      String(port)
    ],
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
  let output = ''
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
    removeFixtureDirectory(directory)
    throw error
  }

  return {
    url,
    workflowUuid: AUTHORING_WORKFLOW_UUID,
    sourcePath,
    logs: () => output,
    stop: async () => {
      await stopChild(child)
      removeFixtureDirectory(directory)
    }
  }
}

const PYTHON_LAUNCHER = String.raw`
import sys
from pathlib import Path

from tests.workflow.test_authoring_engine import WORKFLOW_UUID, _catalog_imports, _source
from unilabos.config.config import BasicConfig
from unilabos.workflow.catalog import CatalogAuthority, TemplateCatalog
from unilabos.workflow.service import WorkflowService
from unilabos.workflow.store import WorkflowStore

working_dir = Path(sys.argv[1])
editable_root = Path(sys.argv[2])
port = int(sys.argv[3])
package_root = editable_root / "production_lab"
source_path = package_root / "workflows" / "demo.py"
source_path.parent.mkdir(parents=True, exist_ok=True)
source_path.write_text(_source(), encoding="utf-8")
editable_root.mkdir(parents=True, exist_ok=True)
(editable_root / "package.yaml").write_text(
    "\n".join([
        "package:",
        "  name: production_lab",
        "",
        "workflows:",
        f"  - workflow_uuid: {WORKFLOW_UUID}",
        "    source: production_lab/workflows/demo.py",
        "",
    ]),
    encoding="utf-8",
)
working_dir.mkdir(parents=True, exist_ok=True)
authority = CatalogAuthority(authority_id="fe-d117-e2e-local", kind="local")
store = WorkflowStore(working_dir / "workflow.db")
try:
    service = WorkflowService(store)
    service.create_workflow(
        name="FE D117 real OS fixture",
        tags=[],
        description="Real persistent Authoring E2E",
        meta_data={},
        workflow_uuid=WORKFLOW_UUID,
    )
    imports = _catalog_imports()
    for item in imports:
        item.template.pop("uuid", None)
        for handle in item.handles:
            handle.pop("uuid", None)
    TemplateCatalog(store).replace(authority, imports)
finally:
    store.close()

BasicConfig.working_dir = str(working_dir)
BasicConfig.workflow_graph_authority = authority
BasicConfig.workflow_editable_package_roots = (editable_root,)

from unilabos.app.web.server import start_server
start_server(host="127.0.0.1", port=port, open_browser=False)
`

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('failed to allocate a loopback port'))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) reject(error)
        else resolvePort(port)
      })
    })
  })
}

async function waitUntilReady(
  url: string,
  child: ChildProcess,
  logs: () => string
): Promise<void> {
  const endpoint =
    `${url}/api/v1/workflows/${AUTHORING_WORKFLOW_UUID}/authoring`
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `production Uni-Lab-OS exited with ${child.exitCode}\n${logs()}`
      )
    }
    try {
      const response = await fetch(endpoint)
      if (response.ok) return
    } catch {
      // Production composition is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`production Authoring did not become ready\n${logs()}`)
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<boolean>((resolveExit) => {
    child.once('exit', () => resolveExit(true))
  })
  child.kill('SIGINT')
  const graceful = await Promise.race([
    exited,
    new Promise<boolean>((resolveTimeout) => {
      setTimeout(() => resolveTimeout(false), 5_000)
    })
  ])
  if (!graceful && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise<void>((resolveExit) => {
      child.once('exit', () => resolveExit())
    })
  }
}

function removeFixtureDirectory(directory: string): void {
  if (
    resolve(directory).startsWith(resolve(tmpdir())) &&
    basename(directory).startsWith('unilab-authoring-os-')
  ) {
    rmSync(directory, { recursive: true, force: true })
  }
}
