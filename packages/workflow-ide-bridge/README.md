# Workflow IDE bridge

Framework-neutral workflow/source synchronization shared by the Theia and
VS Code hosts.

The package owns the parts that must behave identically in both products:

- the `WorkflowIdeBridge` React port used by `@unilab/workflow-editor`;
- node-to-range and cursor-to-node mapping;
- `package://` parsing and workspace candidate paths;
- the dirty/save/source-version state machine that prevents stale reverse
  mapping.

Each IDE keeps a deliberately small adapter. It only needs to:

1. resolve candidate paths with its workspace/file-system API;
2. open or activate an editor and reveal a range;
3. translate its one-based/zero-based cursor coordinates;
4. forward active-editor, selection and dirty-state events into
   `reduceWorkflowIdeSync`.

Theia implements that adapter in
`@unilab/workbench-theia`. A VS Code extension can use the
same package from its extension host; only its manifest/activation entrypoint
and `vscode.*` calls stay host-specific.
