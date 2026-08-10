# Workflow IDE bridge

Framework-neutral workflow/source synchronization shared by the Theia and
VS Code hosts.

The package owns the parts that must behave identically in both products:

- the `WorkflowIdeBridge` React port used by `@unilab/workflow-editor`;
- node-to-range and cursor-to-node mapping;
- `package://` parsing and exact OS-published package mount resolution;
- host-neutral Workflow/Material diagnostics for native Problems/Markers;
- the dirty/save/source-version state machine that prevents stale reverse
  mapping.

`WorkflowIdeHostAdapter` is the shared adapter core. Each IDE keeps a
deliberately small native port. It only needs to:

1. resolve candidate paths with its workspace/file-system API;
2. open or activate an editor and reveal a range;
3. translate its one-based/zero-based cursor coordinates;
4. forward active-editor, selection and dirty-state events into
   `WorkflowIdeHostAdapter.acceptEditor`;
5. publish resolved diagnostics to VS Code Problems or Theia Markers.

Theia implements that native port in `@unilab/workbench-theia`; the packaged
`unilab-authoring` VSIX implements the VS Code port. Both import and execute the
same contract suite from `@unilab/workflow-ide-bridge/testing`.

## Compatibility

Adapters fail closed unless all four values match
`WORKFLOW_IDE_BRIDGE_COMPATIBILITY`:

- protocol version `1`;
- source-map contract `unilab.workflow-source-map/v1`;
- package-source contract `unilab.package-source/v1`;
- minimum OS contract `authoring-source-map/v1`.

The VSIX manifest repeats this matrix under `unilabCompatibility`, so a
Workbench/OS release can check compatibility without loading extension code.
