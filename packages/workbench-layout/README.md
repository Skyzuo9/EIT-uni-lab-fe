# Workbench Layout

`@unilab/workbench-layout` 管理可持久化的工作台布局：panel registry、布局树、
版本迁移与 reducer。它不管理 panel 内部的物料、工作流或编辑器状态。

## 文件导航

- `src/panelRegistry.ts`：允许出现的 panel 类型与工厂。
- `src/panelId.ts`：稳定 panel 标识。
- `src/layoutState.ts`：布局状态类型。
- `src/layoutReducer.ts`：布局命令。
- `src/migrations.ts`：持久化版本迁移。
- `src/defaultLayouts.ts`：默认布局。
- `src/WorkbenchLayout.tsx`：React 组合入口。

## 原则

- 布局持久化只保存 panel 类型、ID、位置、大小和明确允许的轻量配置。
- panel 的领域状态由所属 package 管理；切换布局不能复制或重置领域权威状态。
- 新 schema 必须带版本并提供向前迁移。
- 2D、2.5D、3D、split 是统一实验室视口的模式，不应靠复制整套 panel 树实现。

## 绝对不能做

- 不得把 Material Graph、ReactFlow graph、Three scene 或 workflow document 放进布局。
- 不得用任意组件路径作为持久化 panel 类型。
- 不得无迁移地修改已持久化 schema。

## 验证

```bash
pnpm --filter @unilab/workbench-layout typecheck
```
