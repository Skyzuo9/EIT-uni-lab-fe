# UI1A WorkflowTask Runtime Port 实现 Spec

## 1. 目标与权威

UI1A 在 `packages/services` 冻结前端唯一 Workflow Runtime 网络边界：
Backend-shaped WorkflowTask/WorkflowNodeJob REST、共享 command、feedback cursor
与全局 `/api/v1/events` SSE。OS/backend 是 Task、Job、feedback 和异常的
唯一权威；前端不从 event 构造或乐观改写运行状态。

跨仓协议权威是 `Uni-Lab-OS/Uni-Lab-Core#150`，OS 依据是 R1B 精确受测/
受审候选 `6cc9390623b21061d31800a36f653e7d82750b62`。本文只是 FE owning
repository implementation spec，不代替 Core/Feishu Protocol 或未来 INT-R1 testing
spec。

## 2. Public seam

`WorkflowRuntimePort` 新增以下公开行为：

| Port method | HTTP/SSE | 结果 |
|---|---|---|
| `createWorkflowTask(request)` | `POST /api/v1/workflow-tasks` | 201 envelope 中的 Task 投影 |
| `listWorkflowTasks(query?)` | `GET /api/v1/workflow-tasks?...` | Backend page；query 只写入显式值 |
| `getWorkflowTask(taskUuid)` | `GET /api/v1/workflow-tasks/{uuid}` | Task 权威投影 |
| `listWorkflowTaskJobs(taskUuid)` | `GET /api/v1/workflow-tasks/{uuid}/jobs` | 拓扑顺序 Job 数组 |
| `getWorkflowNodeJob(jobUuid)` | `GET /api/v1/workflow-node-jobs/{uuid}` | 单 Job 权威投影 |
| `listWorkflowNodeJobFeedback(jobUuid, query?)` | `GET .../{uuid}/feedback?...` | sequence cursor page |
| `commandWorkflowTask(taskUuid, request)` | `POST .../{uuid}/commands` | 201 command record；不返回 Task 终态 |
| `subscribeWorkflowRuntime(onInvalidate, options?)` | 全局 `GET /api/v1/events` SSE | 仅 `workflow.runtime.changed` invalidation |

HTTP 全部要求 Backend-shaped `{code: 0, data: ...}` success envelope；缺失
`code`、非零 `code`、缺失 `data` 或同时携带 `error` 一律拒绝为
`INVALID_API_RESPONSE`，不把
非合同值交给 controller。UUID path segment 使用 `encodeURIComponent`。query 使用
`URLSearchParams`，不拼接未编码值。

## 3. DTO 与状态

- Task status：`pending | running | canceling | succeeded | failed | canceled | timeout`。
- Task control：`active | paused | waiting_reconciliation`。
- cleanup：`none | pending | canceling | settled | requires_attention`。
- Job status：`pending | dispatched | running | intervention_required |
  cancel_requested | execution_unknown | succeeded | failed | skipped | canceled | timeout`。
- command：`step | pause | resume | cancel`；status 为
  `pending | succeeded | rejected`。
- Task/Job 保留 Backend snake_case identity 与时间字段，避免 adapter 中建立
  第二套领域真值。JSON projection 字段是 `Record<string, unknown>` 或
  `unknown[]`，不对未冻结的 DAG/device/result 内容猜测更窄形状。

## 4. SSE 不变式

1. 只连接 Backend `apiUrl` 下的全局 `/api/v1/events`，不使用
   `realtimeUrl`、WebSocket、Task-scoped stream 或 polling。
2. 请求头固定 `Accept: text/event-stream`；已有 cursor 时发送
   `Last-Event-ID`。每一个有 `id` 的全局 frame 都推进 cursor，即使它不是
   Runtime event，避免重连重放无关事件。
3. 只向调用方交付 event name 精确为 `workflow.runtime.changed`、且
   data 精确含非空 `workflow_task_uuid` 的 frame。payload 只是 invalidation，
   不携带或生成 Task/Job patch。
4. 以 SSE `id` 去重，有界保留最近 512 个 id。stream 正常结束或网络
   错误后 3 秒重连；HTTP 非 2xx、空 body 或非法 Runtime payload 通过
   `onError` 显式报告。
5. `dispose()` 必须 abort 活动 fetch、取消 reconnect timer，且之后不再
   交付 event/error。

## 5. 分轮兼容与停止线

现有 Legacy Workflow panel 在 UI1A 基线仍引用 `WorkflowRun*` 方法。为保证本轮
可独立 typecheck，UI1A 只将这些方法标记为 deprecated 迁移桥；任何 UI1
新代码不得使用。UI1C 移除旧调用方时同步删除迁移桥，UI1D 以浏览器
网络记录和静态断言验收不存在 `/runtime/runs`、Runtime WebSocket 或轮询。

UI1A 不修改 workflow-editor controller/component/style，不实现 coherent
rehydration，不制作 Playwright fixture，不实现 DAG admission、device dispatch、
Material Reservation、Task output 或 Debugger Hold/step-family。

## 6. TDD 与本轮门禁

测试只通过 `WorkflowRuntimePort` 公开方法观察行为；`HttpClient` 与浏览器
`fetch` 是允许的外部系统边界。按 HTTP Task、command/feedback、SSE resume/
dedupe/reconnect/dispose 纵向切片逐个 RED→GREEN。候选门禁至少包含：

- `pnpm --filter @unilab/services test`
- `pnpm --filter @unilab/services typecheck`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build:web`
- `pnpm build:desktop`
- changed-file format/lint/diff check

本轮没有可见 UI，不产生浏览器截图；截图门属于 UI1D。
