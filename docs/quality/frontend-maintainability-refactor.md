# OS 前端可维护性重构报告

## 当前结论

- 基线：`integration/fe-os-migration@355e2fc498e4d58701b71289cdd031beedef5afa`
- 候选工作区：`dev@39808eda8e10ab8ea3a16e048c39821cc64d215b` 加本轮未提交拆分。
- 本地运行时（LocalRuntime）既有源码按约定冻结，没有修改、移动或格式化。
- 419 个生产源码文件中，除两份冻结文件外，其余文件全部不超过 500 行。
- 变更文件的最高函数圈复杂度不超过 25，精确令牌窗口重复率为 `0.5%`。

## 拆分后的模块边界

### 工作流（Workflow）

- 持久化工作流编写入口只编排工具栏、代码投影、画布、运行区与覆盖层。
- 代码投影、节点库、画布、节点属性、运行区和状态提示分别由独立组件负责。
- 工作流任务（WorkflowTask）仍由同一个编写会话与运行控制器管理，没有增加第二份工作流事实源。
- 操作目录、图导入、输入输出合同和物料来源（MaterialSource）投影分别进入独立工具模块。

### 设备（Device）与设备卡片

- 设备面板拆出目录读取、解锁、持久动作状态和展示层。
- 设备卡片工作台拆成页面编排器、侧栏和预览区；侧栏内部再按工作区、创建入口、卡片选择和 AI 助手分区。
- Electron 主进程拆出窗口、鉴权、文件、设备卡片、可观测性和本地运行时 IPC 注册支持模块。

### 物料（Material）与 2.5D

- 物料存储、React Flow 投影、斜二测投影、形状规范解析和 SVG 图元分别进入独立模块。
- 所有视图仍消费同一份物料聚合（MaterialAggregate），没有引入第二个 store 或场景事实源。

### Pascal 插件与服务层

- Pascal 物料场景桥拆出放置投影、渲染快照、传输场景和线协议模块。
- 服务层拆出物料后端图编解码、旧图兼容编解码、模板编解码、操作目录校验与投影。

## 500 行审计

当前最高的非冻结生产源码文件如下：

| 文件 | 行数 |
| --- | ---: |
| `apps/desktop/src/main/localRuntimeManager.ts` | 500 |
| `apps/desktop/src/main/localDeviceProvisioningManager.ts` | 500 |
| `apps/desktop/src/main/deviceCardManager.ts` | 500 |
| `packages/material/src/react-flow/projection.ts` | 499 |
| `apps/kernel-web/src/components/device/DevicePanel.tsx` | 498 |

本轮没有新增或修改超过 500 行的文件。仍超过 500 行的两份文件均属于冻结范围，且 `git diff` 为空：

| 冻结文件 | 行数 | 后续拆分边界 |
| --- | ---: | --- |
| `apps/kernel-web/src/components/LocalRuntimeLauncher.tsx` | 1,260 | 按启动步骤、配置表单和进程状态拆分；需要先补齐本地进程生命周期回归测试。 |
| `apps/kernel-web/src/components/LocalRuntimeLogDrawer.tsx` | 560 | 按日志标签页、输出格式化和抽屉外壳拆分；与本地运行时启动器一并处理。 |

## 差分质量门禁

`pnpm quality:frontend` 检查相对基线的生产代码变更，并覆盖已提交差异、工作区差异和未跟踪文件：

- 500 行以上文件必须报告；
- 800 行以上深模块（Deep Module）必须登记原因与可执行拆分边界；
- 1,500 行为硬失败；
- 新增或修改函数的圈复杂度默认不得超过 25；
- 对变更源码执行精确令牌窗口重复检查。

旧例外已经删除，质量配置仅保留本轮明确冻结的
`LocalRuntimeLauncher.tsx`。

## 验证

- `pnpm quality:frontend`：通过；268 个生产变更文件，令牌重复率 `0.5%`。
- `pnpm typecheck`：20 个工作区项目通过。
- `pnpm test`：全工作区 717 个测试通过。
- `pnpm build:web`：通过。
- `pnpm build:desktop`：通过。
- `git diff --check`：通过。
- 既有 Sass 旧 API、第三方 `use client`、Pascal source-map 和大块警告仍存在，但没有构建错误。

### SZLab 原生 ROS2 只读端到端测试（E2E Test）基线

这是本轮重构前已保存的只读回归基线，不替代本轮的类型、单元和构建验证：

- OS 候选：`e00aa22be3ed478f9b4cd2dec2f27516c91f1d2e`
- SZLab 工作区：`92034efeceafc4aac220a1b1407e99cadc81bb70`
- 使用公开 `unilab` CLI、ROS2/DDS 后端和 `--test_mode`。
- 没有创建或运行工作流任务（WorkflowTask），没有发送物理动作。
- 证据目录：`/home/changjunhan/Uni-Lab-Core/e2e-artifacts/os-fe-quality-refactor/`。
