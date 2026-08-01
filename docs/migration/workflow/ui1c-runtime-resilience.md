# UI1C Runtime resilience implementation spec

## Outcome

在 UI1B 已接入的 `PersistentWorkflowAuthoringPanel`、`WorkflowDebugger` 和
`WorkflowOutput` 上完成 Runtime 异常与恢复闭环。前端继续只消费 OS 的
Backend-shaped Task、Job、feedback REST projection 与全局 SSE invalidation；
不新增工作台，不恢复 Run/WebSocket/polling，也不把前端状态当作运行真值。

本轮基线固定为本地 FE integration
`8419fbe3ffd161c5ab6abc28f639a627e83e2150`，真实 OS fixture 固定使用本地
`integration/workflow-task-runtime@1f87ebed298a495dbf24780996d69b6423468757`。
二者均尚未 push，因此这里只是受测本地基线，不是远端 acceptance anchor。

## 已确认的 public seams

1. `WorkflowRuntimePort`：
   `GET /workflow-tasks/{uuid}`、`GET .../jobs`、
   `GET /workflow-node-jobs/{uuid}/feedback?after_sequence=...` 和
   `GET /events` SSE。
2. `WorkflowTaskController` 的公开 snapshot/actions：React 只能从一个 coherent
   Task/Jobs snapshot、按 Job 累积的 feedback 和明确的实时连接状态渲染。
3. 原生产 UI：错误、重试、重连、feedback 与重启恢复必须通过
   `WorkflowDebugger` / `WorkflowOutput` 和现有 Runtime problem surface 可见。
4. 真实浏览器边界：Playwright 连接 production FE 与 production OS；故障只由
   浏览器之外的 HTTP fault proxy、OS 进程停止/重启及 OS
   `WorkflowRuntimeCoordinator` producer 注入，不使用 `page.route` 或伪造成功 DTO。

测试只断言这些 public seams 的可观察行为，不断言 controller 私有调用顺序。

## 冻结不变量

### Coherent Task/Jobs

- Task 与 Jobs 并行读取必须作为一个 bundle 安装；任一读取失败时保留最后一个
  完整 bundle，并标记“上一次一致状态已保留”。
- 用户可显式重试；后续 SSE invalidation 或 SSE 重新连接成功也会自动重读。
- HTTP/command accepted 不得直接改变 Task/Job 权威状态。

### Feedback cursor

- 每个 Job 独立维护确认到的最大 `sequence`；只用
  `after_sequence=<cursor>` 增量补读。
- `has_more=true` 时继续分页，`next_cursor` 必须前进；按 UUID、sequence 和
  idempotency identity 去重。
- 某个 Job 的 feedback 读取失败时保留该 Job 已确认记录；其他 Job 的成功补读
  可以安装。刷新、SSE 重连和 OS 重启不得丢失记录。
- 原 `WorkflowOutput` Feedback tab 展示反馈类型、所属 source node、sequence
  和结构化 data；不得新建第二个 Output 面板。

### SSE reconnect

- service port 保存最后一个全局 event ID，重连请求发送 `Last-Event-ID`。
- 非主动 EOF、网络异常或非 2xx 响应进入“实时同步已中断，正在重连”；成功建立
  新 SSE 响应后进入“实时同步已连接”并主动重读当前 Task/Jobs/feedback。
- 重放事件仍按全局 event ID 去重，SSE payload 只作 invalidation。

### OS restart

- E2E 在同一端口、同一 `workflow.db` 上停止并重新启动 production OS composition。
- 外部 producer 只调用 OS `WorkflowRuntimeCoordinator` 公开领域入口产生 running、
  feedback 与 invalidation；不得直接编辑 SQLite。
- restart 后 REST 必须恢复 Task/Jobs/feedback；in-flight Job 由 OS startup recovery
  投影为 `execution_unknown`，前端如实显示“等待状态核对”，不得伪造成功/失败。

## RED → GREEN slices

1. Controller feedback：先写按 Job cursor 增量、分页、去重和刷新不丢记录的失败测试，
   再实现最小 projector。
2. Coherent recovery：先写 partial Task/Jobs failure 保留旧 bundle、明确 stale，随后
   retry/SSE refresh 清除错误的失败测试，再补 snapshot 状态。
3. SSE lifecycle：先写连接 EOF 后报告中断、重连携带 `Last-Event-ID`、新连接通知恢复
   的 service 测试，再扩展 subscription lifecycle callback。
4. Production E2E：先让现有 UI 场景因没有 Feedback/重试/重连状态而失败，再接回原
   `WorkflowDebugger` / `WorkflowOutput`。
5. OS restart：先让同库重启与 startup recovery 场景失败，再扩展真实 OS helper。

## E2E 与截图

单一 serial production 场景至少生成以下 8 张不同验收意义的截图：

1. 第一条 OS feedback 已进入原 Feedback tab；
2. 第二条 feedback 使用 cursor 增量补读且无重复；
3. Jobs partial-read failure 时旧 coherent projection 仍可见；
4. 显式重试后错误清除、projection 恢复；
5. OS 停止后 UI 明确显示 SSE 正在重连；
6. OS 同库重启后 UI 恢复连接；
7. startup recovery 显示 `execution_unknown` / 等待状态核对；
8. 刷新页面后 Task、Jobs 与 feedback 仍从持久 REST 真值恢复。

网络账本必须证明 feedback cursor、`Last-Event-ID`、真实 5xx/断连与恢复，并保持
0 个旧 `/api/v1/runtime/runs*` / Runtime WebSocket 请求、0 个非预期应用
`console.error` / `pageerror`。浏览器为刻意注入的 5xx/断连产生的网络诊断单独记录，
不得与应用异常混记或静默丢弃。

## Gate 与停止线

- `@unilab/services` 和 `@unilab/workflow-editor` 单元测试、全仓 `pnpm test`、
  `pnpm typecheck`、`pnpm build:web`、相关真实 OS Playwright 与可访问性断言通过。
- UI 只做既有 surface 的异常/恢复 hardening；不删除 deprecated Run 接口，删除留给
  UI1D。
- 阶段结束后 non-squash 合入 `integration/fe-os-migration`，更新 OS FE–OS 迁移矩阵、
  FE #2/#5、Core #1/#150，并提交图文报告等待用户判断；未经授权不 push，也不开始
  UI1D。
