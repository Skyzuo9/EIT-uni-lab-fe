# Panel Runtime

此目录当前仅为历史规划保留，**不是 pnpm workspace package，也没有公共 API**。
现阶段 panel 的职责已经拆分为：

- `@unilab/workbench-layout`：registry、布局状态和迁移；
- `apps/kernel-web/src/integrations/lab-workbench`：应用级 panel 组合与跨 panel 交互；
- 各领域 package：panel 内部业务状态。

不要从本目录导入代码，也不要在这里建立第二套 event bus、store 或 renderer。
只有当多个应用出现经过验证、稳定且与领域无关的 panel runtime 契约时，才应通过独立
架构决策将其正式建成 package；届时必须先删除/迁移现有重叠实现。
