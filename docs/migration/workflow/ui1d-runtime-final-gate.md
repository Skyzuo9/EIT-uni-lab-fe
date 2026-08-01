# UI1D Runtime cleanup and final delivery spec

## Outcome

从已经完成 UI1A～UI1C 的生产前端中删除 deprecated Run、Runtime WebSocket、
Task-scoped event 和 polling fallback，使 `WorkflowRuntimePort`、全局
`/api/v1/events` SSE 与原 `PersistentWorkflowAuthoringPanel` 成为唯一 Runtime
入口；随后按 `Uni-Lab-OS/Uni-Lab-Core#152` 执行真实 OS 最终交付门。

本轮远端可解析基线固定为：

- FE integration `008ca66ce52cbbbac91945fffa32d9d64ecba9c5`；
- OS integration `3eb8a59014267f3b6161c36dcbc882c4aa3b9e90`；
- Core submodule pin `9a7467cd4d91a008bdd4b8f754d73fafbb3cacc8`。

本文是 FE owning-repository implementation/testing spec。共享协议和跨仓接受条件仍
由 Core #150/#152 与对应 Feishu revision 管理。

## 已确认的 public seams

1. `@unilab/services` 公共 export 与 `WorkflowRuntimePort`：调用方只能获得
   WorkflowTask、WorkflowNodeJob、command、feedback 与全局 SSE 接口。
2. 浏览器网络边界：production renderer 只访问 Backend-shaped Authoring、Task/Job、
   feedback REST 和全局 SSE；机器账本必须能证明禁用路径数量为零。
3. 原生产工作台：Task/Jobs、accepted→applied、feedback、partial failure、SSE reconnect、
   OS restart 与 reload 继续由既有 `WorkflowDebugger` / `WorkflowOutput` surface 展示。
4. 构建边界：Web 与 Desktop 共用同一 renderer，删除 deprecated export 后全仓
   typecheck/test/build 仍通过。

这些 seam 已由 Core #152 的 integration test spec 固定。测试只断言公开 export、真实
网络请求和用户可观察行为，不绑定内部函数调用顺序。

## 冻结停止线

- 删除 `/api/v1/runtime/runs*`、旧 Runtime WebSocket、Task-scoped event、旧 debug
  command 和 polling fallback 的类型、client、hook、export、fixture 与文档引用。
- 允许历史 migration spec 在明确的“禁止/已删除”语境引用旧路径；静态契约只扫描生产
  source、公共 export 和活跃测试 fixture，不靠删除迁移 provenance 取得绿色。
- 不重做工作台、不改起点/断点交互，不新增第二套 Runtime store/controller。
- 不把普通 Task create 偷换成 Debugger launch；OS-only Hold/step-family 仍归 FE #1 /
  Core #137。
- 不通过 `page.route`、伪成功 DTO、直接编辑 SQLite 或前端计时器证明 E2E。

## RED → GREEN slices

1. 公共合同：先写静态/类型测试，证明 deprecated Run client/type/hook 仍能从公共边界被
   找到，再逐项删除实现和 export。
2. 产品调用方：每次删除一个旧 symbol，先让对应调用方 typecheck/test 失败，再把它迁移
   到现有 Task controller 或删除已经失去产品入口的平行 UI。
3. 网络负向门：先让账本测试因无法证明禁用路径为零而失败，再收敛 Playwright helper，
   记录 REST/SSE/WebSocket/timer 证据。
4. 最终真实 OS gate：在远端 pin 拓扑下依次回归 Authoring、UI1B、UI1C，并补齐 Core
   #152 尚未覆盖的 command replay/conflict、step/terminal race 与静态 cleanup 证据。

## Final gate 与 artifact

- `pnpm typecheck`、`pnpm test`、`pnpm build:web`、`pnpm build:desktop`；
- services/workflow-editor 精确测试与 deprecated-interface 静态契约；
- Authoring、UI1B、UI1C 真实 OS Playwright，以及 UI1D final serial gate；
- 至少 5 张来自原生产工作台、具有不同验收意义的最终截图；
- 网络账本记录 method/path/query/status、SSE `Last-Event-ID`、WebSocket URL、刻意网络
  诊断、应用错误与显式无轮询观察窗，禁用 Runtime 请求必须为零；
- 候选产生后绑定 exact-SHA review。任何 production change 都使 review/E2E 失效。

## 独立 review remediation

首轮 exact-SHA review 的修复必须作为同一 UI1D 候选继续冻结：

- 恢复 `pnpm test:e2e:workflow-debug`，但只组合当前四组真实 OS suites，不恢复旧
  Run/WS Debugger fixture；
- 删除未使用的 `useWorkflowDebug`、`WorkflowPreview`、`DebugToolbar`、静态
  `sampleWorkflow` 与已失去消费者的 `onStepFocus` public seam；
- 静态门逐文件扫描 production source 与活跃 E2E fixture，并逐 symbol 防止旧方法回归；
- final gate 必须由环境变量固定 FE/OS/Core exact SHA，并记录至少 3.5 秒终态无
  Task/Jobs REST polling 的观察窗；
- 重复的面板安装与 Applied Workflow 操作收敛到共享 Playwright helper。

完成后 non-squash 合入并推送 `integration/fe-os-migration`，更新 OS FE–OS 迁移矩阵、
FE #2/#6、Core #1/#150/#152 和 Core submodule pin。只有全部证据与 pin 一致后才允许
Core Decision 进入 `stage:testing`；本轮结束仍按阶段规则提交图文报告并等待用户判断。
