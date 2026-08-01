import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const SZLAB_WORKFLOW_UUID =
  '67da810c-34f6-59c6-94ba-7e73dcc06207'

export interface SzlabActionCatalogOs {
  url: string
  workflowUuid: string
  logs: () => string
  stop: () => Promise<void>
}

export async function startSzlabActionCatalogOs(): Promise<SzlabActionCatalogOs> {
  const osRepository = resolve(
    process.env.UNILAB_A1_OS_ROOT ||
      '/home/changjunhan/Uni-Lab-Core/.worktrees/uni-lab-os-a1-action-catalog-e2e'
  )
  const szlabRepository = resolve(
    process.env.UNILAB_SZLAB_ROOT ||
      '/home/changjunhan/Uni-Lab-Core/Uni-Lab-SZLab'
  )
  const python =
    process.env.UNILAB_OS_PYTHON ||
    '/home/changjunhan/.micromamba/envs/unilab/bin/python'
  const directory = mkdtempSync(join(tmpdir(), 'unilab-a1-szlab-'))
  const workingDirectory = join(directory, 'unilabos_data')
  const port = await availablePort()
  const url = `http://127.0.0.1:${port}`
  let output = ''

  const child = spawn(
    python,
    [
      '-c',
      PYTHON_LAUNCHER,
      workingDirectory,
      szlabRepository,
      String(port)
    ],
    {
      cwd: osRepository,
      env: {
        ...process.env,
        PYTHONPATH: [osRepository, szlabRepository]
          .filter(Boolean)
          .join(':'),
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
    workflowUuid: SZLAB_WORKFLOW_UUID,
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
from uuid import UUID

from unilabos.config.config import BasicConfig
from unilabos.package_manager import WorkspaceSource, compile_package_source
from unilabos.registry.catalog_consumer import (
    register_package_catalog,
)
from unilabos.registry.registry import Registry
from unilabos.workflow.catalog import CatalogAuthority
from unilabos.workflow.composition import compose_workflow_runtime
from unilabos.workflow.service import WorkflowService
from unilabos.workflow.store import WorkflowStore

working_dir = Path(sys.argv[1])
szlab_root = Path(sys.argv[2]).resolve()
port = int(sys.argv[3])
working_dir.mkdir(parents=True, exist_ok=True)

package_catalog = compile_package_source(WorkspaceSource(szlab_root))
registry = Registry()
registry.device_type_registry = {}
registry.resource_type_registry = {}
register_package_catalog(registry, package_catalog)

identity = {}
next_uuid = 1
for record in (*package_catalog.definitions.devices, *package_catalog.definitions.resources):
    value = str(UUID(int=next_uuid))
    next_uuid += 1
    identity[record.fqid] = value
    identity[f"{record.module}:{record.symbol}"] = value

authority = CatalogAuthority(authority_id="szlab-local", kind="local")
store = WorkflowStore(working_dir / "workflow.db")
try:
    service = WorkflowService(store)
    service.create_workflow(
        name="SZLab S04 磁搅单工位调试",
        tags=["szlab", "a1-e2e"],
        description="PackageCatalog 到前端 typed editor 的真实联调 fixture",
        meta_data={},
        workflow_uuid="${SZLAB_WORKFLOW_UUID}",
    )
finally:
    store.close()

compose_workflow_runtime(
    working_dir,
    authority=authority,
    editable_package_roots=(szlab_root,),
    registry_snapshot=registry.device_type_registry,
    resource_template_identity_resolver=identity.__getitem__,
)

BasicConfig.working_dir = str(working_dir)
BasicConfig.workflow_graph_authority = authority
BasicConfig.workflow_editable_package_roots = (szlab_root,)

from unilabos.app.web.server import start_server
start_server(host="127.0.0.1", port=port, open_browser=False)
`

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rejectPort(new Error('Unable to allocate local port'))
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

async function waitUntilReady(
  url: string,
  child: ChildProcess,
  logs: () => string
): Promise<void> {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`SZLab A1 OS exited with ${child.exitCode}\n${logs()}`)
    }
    try {
      const response = await fetch(`${url}/api/v1/workflow-node-templates`)
      if (response.ok) return
    } catch {
      // 服务仍在启动。
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`SZLab A1 OS did not become ready\n${logs()}`)
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
    new Promise<void>((resolveTimeout) => {
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
        resolveTimeout()
      }, 5_000)
    })
  ])
}
