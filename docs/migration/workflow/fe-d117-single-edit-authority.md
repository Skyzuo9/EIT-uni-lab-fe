# Round FE-D117：Authoring 单编辑权与真实 FE–OS 联调设计

日期：2026-08-01

实现分支：`migration/fe-d117-single-edit-authority`

Frontend 基线：`0b800ef2524f701d4c884c660eb788ea021f32e8`

OS 设计起始基线：`integration/workflow-task-runtime@01380449868ccf334f4da1a28c7f6f946fb540d1`

决策来源：`Uni-Lab-Core#139`（D-117）及 OS Round 02G 趋势报告。

## 1. 本轮结果边界

本轮只迁移 Authoring，不迁移旧 `WorkflowRun` runtime，不修改 Backend：

- `packages/services` 增加 Workflow-scoped persistent Authoring aggregate、Draft PUT、
  single-token Apply 与 Authoring SSE 失效通知；
- `packages/workflow-editor` 用显式按钮选择“代码模式”或“画布模式”；
- 代码模式仅 Python Draft 可写，DAG 是 server-owned Candidate 的只读投影；
- 画布模式仅画布编辑缓冲可写，Python 是 OS `generate-python` 产生的只读投影；
- 模式只属于当前前端会话，不写入 OS；不同 Workflow 会话互不互斥；
- 模式切换、保存和 Apply 前必须处理未保存修改，不能静默丢失；
- 画布保存必须先展示完整规范化 Python diff，用户接受后才执行 Draft PUT；
- 两种模式最终都走 Draft PUT 双 CAS，再使用 server-issued `candidate_hash` Apply；
- Apply 请求不得携带 Candidate、Draft hash 或 Workflow revision；
- 真实 E2E 启动 OS production app、真实 SQLite、真实 compiler 和真实 SSE；Catalog
  只允许通过 02C 明确的 local importer seam seed，禁止前端 route mock。

## 2. 不变量

1. 一个工作区可打开、修改或运行多个 Workflow；互斥只发生在单个 Workflow 编辑会话的
   两种表示之间。
2. 前端不创建 Canvas Draft 持久模型，不自动合并 Python 与画布增量，不提供 force
   overwrite。
3. Candidate 完整内容只从 OS aggregate 读取；前端 Apply 只回传其不透明 hash。
4. SSE 是失效通知。收到目标 Workflow 的 `workflow.authoring.changed` 后重新 GET aggregate，
   不把 event data 当业务状态 patch。
5. CAS 或 Catalog 冲突失败关闭，保留当前编辑内容，并给出可行动的刷新提示。
6. Apply 不回写源码；画布模式接受完整 diff 后的 Draft PUT 才是源码写入动作。
7. 组件不直接 `fetch`；HTTP、SSE、cursor 和 envelope 处理均封装在
   `packages/services/src/workflow.ts`。

## 3. 前端深模块 Interface

在现有 `WorkflowRuntimePort` 中暂时增加高内聚 Authoring 操作；本轮不重写 runtime：

```ts
getWorkflowAuthoring(workflow_uuid)
saveWorkflowAuthoringDraft(workflow_uuid, request)
applyWorkflowAuthoring(workflow_uuid, { candidate_hash })
subscribeWorkflowAuthoring(workflow_uuid, onInvalidate, options)
```

Wire DTO 保持 OS snake_case。Draft 请求字段恰好为
`python_source`、`expected_draft_hash`、`expected_workflow_revision`；Apply 请求字段恰好为
`candidate_hash`。成功 envelope 必须是 `{code: 0, data: ...}`，结构化错误不得吞掉。

订阅按 `Last-Event-ID` 恢复全局 `/api/v1/events`；只接受事件名
`workflow.authoring.changed` 且 `data.workflow_uuid` 等于当前会话的帧。事件只触发 aggregate
补读，由订阅 owner 串行化并合并重复失效。

## 4. UI 状态机

会话状态：

```text
code mode
  Python editor: writable
  DAG: candidate projection, read-only

canvas mode
  DAG buffer: writable
  Python editor: generated projection, read-only
  save -> generate full Python -> show full diff -> accept -> Draft PUT
```

按钮使用 `aria-pressed`、明确中文标签和只读说明。只读不仅靠样式：CodeMirror 必须禁用
编辑；DAG 必须关闭拖拽、连接、删除和参数变更入口。当前候选不可用时仍展示 Applied Graph，
但明确标注“暂无可应用候选”，不能把 Applied Graph 冒充 Candidate。

模式切换若当前表示有未保存修改，先打开确认面板；取消保持原模式。进入另一模式时通过 OS
重新生成或编译投影，失败则保持原模式和编辑内容。

## 5. 测试切片与合并门

独立 test-author 先提交 RED 测试，至少覆盖：

- service 精确路径、snake_case DTO、严格 envelope、single-token Apply；
- Authoring SSE `Last-Event-ID`、Workflow 过滤、重复失效合并与 dispose；
- 单编辑权纯策略：两个模式的可写面互斥，多 Workflow 会话不共享模式；
- 切换 dirty guard、只读语义、完整 diff 接受前不得 Draft PUT；
- Apply 只使用当前 aggregate 的 `candidate_hash`；冲突保留编辑内容；
- 真实 OS E2E：GET → Draft PUT → SSE → GET → Apply → GET，禁止 route mock。

唯一 reviewer 在实现完成后按 Standards 与 D-117 Spec 双轴评审。最终至少执行：

```bash
pnpm --filter @unilab/services typecheck
pnpm --filter @unilab/services test
pnpm --filter @unilab/workflow-editor typecheck
pnpm --filter @unilab/workflow-editor test
pnpm typecheck
pnpm test
pnpm build:web
pnpm build:desktop
pnpm test:e2e:workflow-authoring
```

浏览器 E2E 的 `console.error`、`pageerror` 必须为空。测试全部通过、reviewer 的 blocking
归零、趋势报告完成后才允许非 squash 合并到最新前端 integration；不 push。

## 6. 本轮明确不做

- Backend 修改或 Backend Authoring 新接口；
- FE-0～FE-6 的 WorkflowTask runtime/SSE/debugger 迁移；
- P0-3～P2 的 Material、Action、Task output、Hold、Join 或 `tool_call`；
- 部署 Catalog importer；受控 E2E seed 不能宣称该部署能力已完成。
