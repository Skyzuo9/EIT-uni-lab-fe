# 前端端到端测试

工作流 E2E 只连接生产 `Uni-Lab-OS` composition，浏览器不得用
`page.route()` 伪造成功响应。OS fixture 使用持久 `workflow.db`、Backend-shaped
Workflow HTTP API 与全局 SSE；故障注入只允许位于浏览器之外的透明代理。

## 当前工作流门禁

- `workflow-authoring-real-os.spec.ts`：Draft、规范化差异、Apply、外部修改与多面板隔离。
- `workflow-task-runtime-real-os.spec.ts`：原生产工作台通过 Task/Jobs/commands 与全局 SSE 运行。
- `workflow-task-runtime-resilience-real-os.spec.ts`：feedback cursor、部分读取失败、SSE 重连与同库 OS restart。
- `workflow-runtime-final-gate-real-os.spec.ts`：旧 Run/WS/polling 负向门禁、command 幂等/冲突、terminal race、重载恢复与最终视觉证据。

已退役的 local bridge、Canonical/Run、Task-scoped events 和旧 Debugger E2E 不得恢复。
设备执行与真实 driver 归后续 Device execution 阶段；UI1D 只用静态/单元门禁确认
临时单节点 Run 入口已移除，不伪造尚不存在的生产设备 Catalog/执行接口。

## 运行

默认 OS worktree 位于：

```text
/home/changjunhan/Uni-Lab-Core/.worktrees/uni-lab-os-runtime-integration
```

如需覆盖，设置：

```bash
export UNILAB_AUTHORING_OS_ROOT=/path/to/Uni-Lab-OS
export UNILAB_OS_PYTHON=/path/to/python
```

最终门禁还必须显式固定当前 acceptance checkout；缺少任一变量会 fail closed：

```bash
export UNILAB_EXPECTED_FE_SHA=<exact-fe-candidate-sha>
export UNILAB_EXPECTED_OS_SHA=<exact-os-checkout-sha>
export UNILAB_EXPECTED_CORE_SHA=<exact-core-baseline-sha>
```

常用命令：

```bash
pnpm test:e2e:workflow
pnpm test:e2e:workflow-final-gate
pnpm test:e2e:workflow-debug
```

最终门禁可用 `UNILAB_E2E_ARTIFACT_DIR` 指定证据目录。账本必须记录精确 FE/OS
SHA、请求/响应、SSE cursor、WebSocket URL、浏览器诊断、显式无轮询观察窗与截图列表。

## 通过标准

- 浏览器不访问 `/api/v1/runtime/runs*`、`/api/v1/runtime/events`、Task-scoped event route 或 Runtime WebSocket。
- Task/Jobs、command accepted→applied、feedback、partial failure、SSE reconnect、OS restart 与 reload 均由真实 OS 返回。
- 原 `PersistentWorkflowAuthoringPanel`、起点/断点、Task 控制与 Output UI 保留。
- 非预期 `console.error`、`pageerror` 和未处理 Promise rejection 为零。
- 最终候选至少生成 5 张不同验收意义的截图和机器可读网络账本。
