# Theia workflow integration prototype

> PROTOTYPE ONLY — this app exists to answer one integration question and is
> intentionally kept outside the production application shell.

## Question

Can a stock Theia workspace keep its file tree, Monaco editor and Pyright LSP,
while mounting the existing Uni-Lab material/workflow surfaces, synchronizing
workflow nodes with physical Python source ranges in both directions, and
hosting AionUi agent sessions against that same workspace?

## Assumptions

- Uni-Lab OS is available at `http://127.0.0.1:18003`.
- AionUi is installed at `/Applications/AionUi.app` (override with
  `AIONUI_APP=/path/to/AionUi.app`). Its sidecar binds to loopback only.
- The Theia workspace root is either the registered source package root or its
  parent. A `package://package-id/path/to/workflow.py` URI is tried as both
  `<workspace-root>/package-id/path/to/workflow.py` and
  `<workspace-root>/path/to/workflow.py`.
- The external Monaco document must be saved before reverse mapping resumes.
  This keeps a stale OS source map from selecting the wrong canvas node.

## Run

From the repository root:

```bash
pnpm install
pnpm prototype:theia
```

Open <http://127.0.0.1:3100>. The prototype workbench and AionUi right sidebar
open automatically. AionUi receives the same `THEIA_WORKSPACE`, keeps its own
prototype data under `~/.aionui-theia-prototype`, and auto-detects local agent
CLIs such as Codex and Claude Code.
Choose a workflow, click a canvas node to open/select its Python range, then
move the Monaco cursor inside another mapped range to select that canvas node.

To open the package root registered with OS instead of this repository:

```bash
THEIA_WORKSPACE=/absolute/path/to/source-package pnpm prototype:theia
```

For a non-default OS endpoint and a deterministic workflow, append both query
parameters:

```text
?backend=http://127.0.0.1:18103&workflowUuid=<workflow-uuid>
```

## SZLab smoke test

Start OS with the SZLab repository as its public workspace and use simulated
actions so no device command is sent:

```bash
PYTHONPATH=/absolute/path/to/Uni-Lab-OS:/absolute/path/to/Uni-Lab-SZLab \
python -m unilabos.app.main \
  --workspace /absolute/path/to/Uni-Lab-SZLab \
  --working_dir /absolute/path/to/runtime \
  --config deployment/local_config.py \
  --graph deployment/graphs/szlab-local-debug.json \
  --backend ros --app_bridges fastapi --action_mode simulate \
  --port 18103 --disable_browser --external_devices_only \
  --ros_discovery_server off
```

Then start Theia with `THEIA_WORKSPACE` pointing at that SZLab checkout. Verify:

1. clicking an S06 canvas node opens `workflows/s06_robot.py` at the OS source
   range;
2. moving the saved editor cursor into a different range selects that node;
3. editing the file pauses reverse mapping while dirty;
4. saving keeps mapping paused until OS publishes a new candidate/source map,
   then automatically resumes it.

This sequence validates the shared IDE boundary, not workflow execution; the OS
command above intentionally uses `simulate`.

Success means the integration seam works. It does not mean this throwaway app
is a production shell or a replacement for the existing web application.
