# UniLab Authoring Workbench

The formal Theia application for one managed-local Uni-Lab OS Workspace. It can
run in a browser or inside the shared UniLab Electron Desktop shell. The Theia
Workspace and OS WorkspaceSource use the same normalized Editable Package root.
Runtime state and diagnostics are stored below `<workspace>/.unilabos/`.

## Start with SZLab

```bash
THEIA_WORKSPACE=/absolute/path/to/Uni-Lab-SZLab \
UNILAB_OS_PROJECT=/absolute/path/to/Uni-Lab-OS \
UNILAB_PYTHON_ENV=/absolute/path/to/conda/env \
pnpm workbench
```

`UNILAB_PYTHON_ENV` is optional when the active environment or a standard local
Conda location contains both Python and the `unilab` CLI. An explicitly selected
environment is authoritative: if it becomes invalid, Workbench fails closed and
does not silently switch environments.

When an environment is selected, the launcher gives Theia's Python extension,
integrated terminals and the managed OS the same activated `PATH`, `CONDA_PREFIX`
and `PYTHONPATH` view (OS source root plus Editable Package root).

Open <http://127.0.0.1:3100>. The Workbench backend owns OS startup, readiness,
logs, PID identity and shutdown. Material and Workflow surfaces remain disabled
until the managed OS reports health, workflow-template and device-catalog
readiness.

The “环境管理” panel uses the user-facing name **OS** and exposes OS, PLC-Sim
and Agent as one local status chain. Set `UNILAB_PLC_SIM_PROJECT` to preselect a
PLC-Sim repository, or save the path from the panel. The machine-local selection
is persisted in `<workspace>/.unilabos/environment.local.json` and excluded by
the Workbench-managed `.gitignore`.

The browser is the control surface, not the process owner. Its RPC calls are
handled by the local Theia Node backend, so browser and desktop Workbench share
the same lifecycle. If the Theia backend is deployed remotely, the panel manages
processes on that backend host.

## Start as a desktop application

```bash
THEIA_WORKSPACE=/absolute/path/to/Uni-Lab-SZLab \
UNILAB_OS_PROJECT=/absolute/path/to/Uni-Lab-OS \
UNILAB_PYTHON_ENV=/absolute/path/to/conda/env \
UNILAB_WORKFLOW_UUID=optional-workflow-uuid \
pnpm workbench:desktop
```

This builds the existing `apps/desktop` shell and the Workbench, waits for the
local Theia server, then opens it in Electron. Workbench therefore reuses the
Desktop preload/IPC, authentication, file dialogs, local runtime, device-card,
device-provisioning, diagnostics and safe-quit implementation. The privileged
renderer is restricted to its original `http://127.0.0.1` origin; remote
renderer URLs and cross-origin navigation are rejected.

The legacy Electron kernel surface does not depend on Theia. Its
`LocalRuntimeManager` and Theia's `WorkbenchSession` instead share the lower
level `@unilab/local-environment` package for Conda/Python discovery and the
validated PLC-Sim launch contract.

Signed/notarized macOS and signed Windows distribution remain the responsibility
of the Workbench T11 and T13 delivery slices. This command is the local desktop
development and acceptance entry point.
