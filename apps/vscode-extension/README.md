# UniLab Authoring for VS Code

This lightweight VSIX is the VS Code adapter for
`@unilab/workflow-ide-bridge`. It opens and highlights exact Workflow,
MaterialSource and ResourceTemplate locations, maps editor selections back to
Workflow nodes, and publishes UniLab diagnostics to VS Code Problems.

The extension intentionally does not start or attach UniLab OS, Simulator,
Agent, PLC-Sim or device processes. A same-host UniLab renderer/extension calls
the exported activation API or the `unilab.ide.publishSnapshot` command with an
OS-signed package-mount/source-map snapshot.

## Adapter API

```ts
const api = await vscode.extensions
  .getExtension<UniLabIdeExtensionApi>('unilab.unilab-authoring')!
  .activate()

await api.publishSnapshot({
  compatibility: api.compatibility,
  packageMounts,
  sourceProjection,
  diagnostics
})
```

`api.onDidChangeEditorContext` emits the exact active `package://` URI,
one-based source position and mapped Workflow node UUID for code-to-canvas and
code-to-Material highlighting.

## Package

```bash
pnpm --filter unilab-authoring package:vsix
```

The output is `dist/unilab-authoring-0.1.0.vsix`.
