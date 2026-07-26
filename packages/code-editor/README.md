# @unilab/code-editor

可复用的 CodeMirror 6 编辑器外壳。它为设备 YAML、工作流 JSON 和工作流 Python
提供编辑、dirty 状态、行标记与定位能力，但不理解工作流业务。

## 对外能力

`useCodeMirror(initialValue, language)` 支持 `yaml | json | python`，返回：

- `value`、`isDirty`：当前内容与保存基线。
- `replaceContent(next)`：整体替换内容，并把新内容设为基线。
- `markSaved()`：只更新保存基线。
- `setLineMarkers(markers)`：设置工作流代码行状态。
- `revealLine(line)`：滚动到目标行并聚焦。
- `containerRef`：交给 `CodeEditor` 挂载 CodeMirror。

`CodeEditor` 只渲染标题、语言、未保存提示和编辑器容器。

## 工作流行标记

支持 `before-start`、`start`、`breakpoint`、`paused`、`running`、`success`、
`failed`、`skipped`。标记由 `workflow-editor` 根据 Canonical node id、
Python `source_map` 和 OS 节点投影计算；本 package 不自行推断状态。

使用时必须遵守：

- Python 编译后用新的 source map 重新计算标记。
- 同一行可以有多个标记，例如起始点与断点。
- `paused` 与 `running` 是不同状态，不能使用同一种 class 或标签。
- 行号会被安全限制到当前文档范围，但上游仍应提供正确映射。
- 颜色必须配套文字 Widget；不能仅以背景色表达含义。

## 不能放在这里的逻辑

- backend/OS 请求、WebSocket 和重试。
- Python `eval`/`exec`、AST 编译或 Canonical 转换。
- DAG 布局、节点选择、起始点和断点状态机。
- 保存成功、运行成功或调试暂停的模拟。

## 验证

```bash
pnpm --filter @unilab/code-editor typecheck
pnpm --filter @unilab/workflow-editor typecheck
pnpm test:e2e:workflow
```

修改 marker class 时，还要人工或用 Playwright 检查 JSON/Python 两种模式的起始点、
断点、暂停、运行、成功和跳过展示。
