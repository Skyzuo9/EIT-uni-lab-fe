# App Shell

`@unilab/app-shell` 提供应用外壳和可复用布局原语，例如工作区 frame、split pane 与
通用容器。它只处理结构和交互，不理解物料、工作流或设备。

## 使用规则

- 业务 package 可以组合这里的布局原语。
- 可配置主题值从 design system token 进入，不在组件里写业务主题分支。
- panel 身份、持久化与迁移属于 `@unilab/workbench-layout`。
- 领域数据和服务调用留在所属 package 或应用组合根。

## 绝对不能做

- 不得新增业务 store、API client 或 Profile 分支。
- 不得根据 panel 内容硬编码尺寸和行为。
- 不得复制 `workbench-layout` 的 registry/reducer。

## 验证

```bash
pnpm --filter @unilab/app-shell typecheck
```
