# UI1B 原 Runtime UI + WorkflowTaskController 实现 Spec

## 1. 目标与权威

UI1B 交付第一个可独立视觉验收的 Runtime 纵向切片：在现有
`PersistentWorkflowAuthoringPanel` 工作台中复用原 Runtime 控制条和输出 dock，
只把运行数据源从旧 Run/WebSocket/polling 迁移到 Backend-shaped WorkflowTask、
WorkflowNodeJob REST 与全局 `/api/v1/events` SSE。

跨仓协议权威是 `Uni-Lab-OS/Uni-Lab-Core#150`；网络 port 已由 UI1A 冻结。
本文是 FE owning repository 的 implementation spec，不代替 Core/Feishu Protocol
或未来 `Uni-Lab-OS/Uni-Lab-Core#152` integration test spec。

## 2. UI 复用边界

下列既有实现必须复用，不建立平行 UI：

- `WorkflowDag` 与 Authoring 代码/DAG 双面工作台；
- `WorkflowDebugger` 的控制条 DOM、class、按钮分组、状态标记和键盘语义；
- `WorkflowOutput` 的折叠 dock、节点列表、tab、错误区域和响应式布局；
- `workflow.module.scss` 现有 palette、design tokens、密度与断点。

允许的改动仅限：把两个 Runtime 组件的 props 最小泛化为中性 view model、增加
Task/Job 状态 label/class、在 Persistent panel 中组合运行区，以及为新组合增加必要
尺寸规则。不得创建截图专用页面、替代工作台、新视觉系统或重排 Authoring 主流程。

## 3. Controller public seam

`WorkflowTaskController` 只依赖 `WorkflowRuntimePort`，公开不可变 snapshot 与以下命令：

- `start()`：先安装全局 Runtime SSE subscription，再读取当前 workflow 最新 Task；
- `create(runMode)`：创建 `normal | step` Task，随后补读 Task/Jobs；
- `command(type)`：提交 `step | pause | resume | cancel` durable intent；
- `refresh()`：读取 Task 与 Jobs，只有两者都成功才替换 coherent projection；
- `subscribe(listener)` / `dispose()`：组件订阅与生命周期。

snapshot 至少包含 loading、最新 Task、拓扑顺序 Jobs、最近 command record、
可恢复 error 和 refresh generation。HTTP 201 command 只更新“OS 已接受”的 command
record，不修改 Task/Job 权威状态；applied 只能在 SSE invalidation 后由 REST 补读观察。

## 4. Rehydration 不变式

1. 初始化先订阅后读取，避免 snapshot 窗口丢失 invalidation。
2. 无当前 Task 时使用 `listWorkflowTasks({workflow_uuid, page: 1,
   page_size: 1})` 找到最新 Task；有 identity 时使用 `getWorkflowTask`。
3. Task 与 Jobs 并行读取；任一失败都保留上一份 coherent bundle，只更新 error。
4. 同一 workflow 当前 Task 的 invalidation 触发 REST rehydration；其他 Task event 忽略。
5. in-flight invalidation 合并为下一轮 refresh，不启动无界并发请求。
6. 页面 reload 不依赖前端缓存，通过 list/get REST 恢复最新 Task。
7. `dispose()` 后 abort 逻辑更新，不再通知 listener。

feedback cursor、partial-failure 的可见恢复流程、SSE 断连补水和 OS restart/recovery
由 UI1C 在同一 controller/UI 上硬化；UI1B 先冻结 coherent bundle 基础行为。

## 5. 运行 UI 语义

- toolbar 复用现有 segmented/button 样式，提供“正常运行 / 单步模式”和“开始运行”。
- 控制条标题由“工作流调试器”中性化为“工作流运行”，但保留原结构和样式。
- 主状态显示 Task `status` 与 `control_status`；不能把 command accepted 显示成 applied。
- pause/resume/cancel 的 enablement 只依据当前 Task 权威状态；step 只在 step mode 且
  paused 时启用。
- 输出 dock 将 WorkflowNodeJob 适配成原节点卡片 view model，展示 Job UUID、
  workflow node UUID、executor kind、attempt、status 和现有结果 JSON 区。
- Runtime error 与 Authoring error 分区；错误可清除，但清除不改变 OS 状态。

## 6. 真实 OS 浏览器验收与截图

Playwright 使用 production OS 进程、真实 SQLite、真实 HTTP/SSE 和 production web UI；
不得 `page.route`、返回伪造 Task/Job DTO 或访问测试专用页面。一个 serial 场景覆盖：

1. Authoring/DAG 就绪，原 UI 未被替换；
2. 创建 normal Task，显示 Task identity 与预创建 Jobs；
3. pause command 先显示 accepted，随后 SSE/REST 显示 paused；
4. resume command 先显示 accepted，随后显示 active；
5. cancel command 先显示 accepted，随后 Task/Jobs 显示 canceled；
6. reload 后恢复同一 Task 与 Jobs。

至少保存 6 张有上述不同语义的浏览器截图。测试同时记录所有 Runtime requests，
断言只出现 `/api/v1/workflow-tasks*` 与 `/api/v1/events`，不出现
`/api/v1/runtime/runs*`、Runtime WebSocket、Task-scoped event route 或 polling。

## 7. TDD 与停止线

先写真实浏览器 public seam 红测证明现有生产 UI 尚无 Task 控制，再逐个增加 controller
public-seam 单测。Mocks 只允许位于 `WorkflowRuntimePort` 外部系统边界；React/E2E 不 mock
controller 或 OS 响应。候选门禁至少包含：

- `pnpm --filter @unilab/workflow-editor test`
- `pnpm --filter @unilab/workflow-editor typecheck`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build:web`
- UI1B real-OS Playwright 与截图人工检查

UI1B 不实现 feedback cursor 可见历史、不注入 partial read/SSE/restart 故障、不删除旧
Run DTO/client/hook/Debugger command。阶段末更新 FE #2、Core #150、OS 接口迁移表并
提交实现与截图报告；等待用户判断后才进入 UI1C。
