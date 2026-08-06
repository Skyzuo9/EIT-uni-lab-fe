# OS 前端可维护性重构报告

## 范围

- 基线：`integration/fe-os-migration@355e2fc498e4d58701b71289cdd031beedef5afa`
- 候选分支：`refactor/os-non-local-runtime-hotspots`
- `LocalRuntime*` 文件：按本轮约定冻结，未修改、未移动、未格式化。
- 目标：在不改变产品行为与接口契约的前提下，拆分超大文件、消除重复实现、降低热点函数的圈复杂度，并把规则固化为差分质量门禁。

## 模块边界

### 工作流（Workflow）

- `packages/services/src/workflow.ts` 保留稳定公开出口，合同、路径、编解码、SSE 和端口实现分别进入独立模块。
- `PersistentWorkflowAuthoringPanel.tsx` 保持薄组合入口；工具栏、覆盖层、目录、画布节点编辑与运行入口状态机分别进入独立模块，主 hook 只保留跨步骤事务编排。
- 工作流任务（WorkflowTask）面板状态从主 hook 分离，但仍由同一个编写会话统一控制，避免产生第二份工作流（Workflow）事实源。

### 设备（Device）

- 设备面板拆出动作可用性、锁控制、展示模型和各视图。
- 设备卡片工作台拆成薄入口、展示组件和生命周期 hook；原有导出路径保持不变。

### 物料（Material）与 2.5D

- 斜二测画布拆出相机、几何、图例、物体解释器以及堆栈/库位（Site）投影。
- 仍只消费同一份物料聚合（MaterialAggregate），没有增加第二个 store 或场景事实源。

### Pascal 插件与样式

- Pascal 插件中重复的 world placement 和 capability 计算已合并。
- 三个超大样式入口改为只负责有序引入，规则按原顺序切成小于 500 行的 partial；未改变选择器优先级或加载顺序。

## 同口径审计结果

以下统计均排除测试、构建产物和依赖目录；重复度使用相同的 jscpd 参数（`minLines=8`、`minTokens=50`），圈复杂度使用同一 TypeScript AST 统计器。

| 指标 | 基线 | 候选 | 变化 |
| --- | ---: | ---: | ---: |
| 生产文件 | 290 | 339 | +49（拆分） |
| 生产代码行 | 78,106 | 78,961 | +855 |
| 大于 500 行文件 | 35 | 33 | -2 |
| 大于等于 1,500 行文件 | 9 | 3 | -6 |
| 逻辑重复行 | 482（0.78%） | 382（0.61%） | -100 行 / -0.17pp |
| 样式重复行 | 392（2.48%） | 390（2.46%） | -2 行 / -0.02pp |
| 最大函数圈复杂度 | 136 | 123 | -13 |
| 圈复杂度大于 20 的函数 | 32 | 31 | -1 |
| 圈复杂度 P95 / P99 | 8 / 18 | 8 / 18 | 持平 |

候选中仍大于等于 1,500 行的三个生产文件全部属于本轮冻结的 `LocalRuntime*` 范围。本轮变更代码的精确令牌窗口重复率为 `0.0%`。

## 超过 500 行的变更文件

| 文件 | 行数 | 保留原因 | 可执行的下一拆分边界 |
| --- | ---: | --- | --- |
| `apps/kernel-web/src/components/device-cards/useDeviceCardWorkbench.ts` | 702 | 工作区生命周期、代理桥接和实时绑定共享严格时序，暂时集中可避免重复连接。 | 补齐生命周期并发测试后，拆成 `useDeviceWorkspaceLifecycle`、`useDeviceAgentBridge`、`useDeviceLiveBindings`。 |
| `apps/kernel-web/src/components/device/DevicePanel.tsx` | 638 | 单动作持久任务、反馈序列化和人工解锁必须由同一控制器保持顺序。 | 增加任务重入/解锁失败测试后，提取 `useDeviceActionTask`。 |
| `packages/material/src/oblique/MaterialObliqueCanvas.tsx` | 551 | 根画布统一负责相机、拖拽和 z-order，避免各物体实现分裂的坐标语义。 | 增加视口手势回归测试后，提取 `useObliqueViewportGestures`。 |
| `packages/material/src/oblique/ObliqueMaterialObject.tsx` | 866 | 这是一个集中 SVG 形状解释器；绘制顺序直接决定遮挡语义。 | 增加 SVG paint-order 快照后，提取 open-rack 与 lathe 图元模块。 |
| `packages/workflow-editor/src/components/PersistentWorkflowAuthoringView.tsx` | 612 | 主视图仅保留代码、画布与运行栏的同屏布局；工具栏和抽屉/冲突覆盖层已拆出。 | 为工作台补齐独立视觉回归后，可继续抽取 `PersistentWorkflowWorkbench`。 |
| `packages/workflow-editor/src/hooks/usePersistentWorkflowAuthoring.ts` | 1,163 | 双 CAS、外部失效补读、草稿规范化和候选应用共享严格事务顺序，属于关键深模块（Deep Module）；目录、节点编辑和运行入口状态机已拆出。 | 增加外部失效/冲突重试状态机测试后，提取 `usePersistentWorkflowAuthoritySync`。 |
| `packages/workflow-editor/src/utils/workflowActionCatalog.test.ts` | 1,604 | 历史测试文件已超过硬限制；本轮只做 12 行最小接缝变更，使断言读取拆分后的组合模块，没有增加测试责任。 | 下一次修改前按合同域拆为 port、schema、material-flow、catalog refresh 四组测试。 |

其中 800–1,499 行的两个生产文件是有明确接口收益和后续拆分边界的关键深模块（Deep Module）；没有新增或继续扩张任何大于等于 1,500 行的生产文件。

## 差分质量门禁

`pnpm quality:frontend` 只检查相对 `origin/integration/fe-os-migration` 的生产代码变更，并同时覆盖已提交差异、工作区差异和未跟踪文件：

- 超过 500 行必须报告；
- 超过 800 行必须在 `scripts/frontend-quality-exceptions.json` 记录中文原因和未来拆分边界；
- 1,500 行为硬失败；
- 新增/修改函数圈复杂度默认不得超过 25，例外必须命名；
- 对变更代码执行精确令牌窗口重复检查。

例外是带原因和到期拆分边界的显式债务登记，不是全仓库放宽规则。

## 验证

- `pnpm quality:frontend`：通过。
- `pnpm typecheck`：19 个工作区项目通过。
- `pnpm test`：全工作区通过。
- `pnpm build`：Web 与 Electron 构建通过；仅保留既有 Pascal source-map、`use client` 和 chunk-size 警告。
- `git diff --check`：通过。
- `git diff/status | rg -i 'local.?runtime'`：无输出。

### SZLab 原生 ROS2 只读端到端测试（E2E Test）

- OS 候选：`e00aa22be3ed478f9b4cd2dec2f27516c91f1d2e`
- SZLab 工作区：`92034efeceafc4aac220a1b1407e99cadc81bb70`（测试时工作区当前提交）
- 启动方式：公开 `unilab` CLI、ROS2/DDS backend、`--test_mode`、FastAPI、边缘调度器（Edge Scheduler）。
- 没有创建或运行工作流任务（WorkflowTask），没有发送物理动作。
- ROS2 图：9 个设备节点；ActionServer 可发现。
- OS HTTP：健康检查通过；9 台设备在线；129 个物料（Material）、418 个库位（Site）、15 个形状；16 个工作流（Workflow）。
- 候选前端直接连接 OS：物料视图和含显式物料转运的 S07 工作流画布均成功展示；`console.error` 与 `pageerror` 均为 0。
- 证据目录：`/home/changjunhan/Uni-Lab-Core/e2e-artifacts/os-fe-quality-refactor/`。
