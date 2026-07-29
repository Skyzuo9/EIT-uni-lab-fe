# @unilab/workflow-editor

Uni-Lab 前端唯一的工作流引擎与编辑器，源自 `uni-lab-fe` 当前实现。

该 package 拥有工作流文档、代码编辑、DAG 画布和编辑状态。不得引入
Uni-Lab-Cloud 的 workflow canvas、revision store、canvas controller 或
Redux 状态。不同后端的工作流数据必须先通过 `services`/app adapter 转换为
本 package 的内部模型。

## 它负责什么

- 在 JSON（Canonical v2）和 Python 两种编写模式间切换。
- 用同一个 revision 驱动代码、DAG、保存、校验与执行。
- 展示完整控制流 DAG，包括 branch、join 和分支边。
- 配置起始点、断点与 `pause_on_start`，发送运行和调试命令。
- 消费 OS/backend 的 run、node、event 投影，展示逐节点结果和异常。

它不负责选择 backend、拼接 URL、解释用户 Python 或执行 DAG；这些能力分别属于
应用壳、`@unilab/services` 和 OS/backend。

## 单一数据流

```text
Canonical WorkflowRevision v2
        │
        ├─ parse/project ───────────────► ReactFlow DAG
        ├─ generate-python (OS) ────────► Python + source_map
        ├─ validate/save (OS/backend) ──► persisted revision
        └─ create run ──────────────────► complete immutable DAG

Python edit ── compile + validate (OS) ──► new Canonical revision
```

ReactFlow 的 `nodes`/`edges` 不是保存或执行输入。任何时候都从最后一个已验证的
Canonical revision 下发完整 DAG，并把 `start_node_id`、`breakpoints` 作为单独的
debug 配置发送。

## JSON / Python 切换

切到 Python 时调用：

1. `generatePythonWorkflow`：Canonical → Python 候选及 `source_map`。
2. `validateAuthoringCandidate`：确认候选与 action catalog、schema 一致。
3. 验证成功后才替换编辑器内容。

Python 发生编辑后，切回 JSON、保存、校验或运行前调用：

1. `compilePythonWorkflow`：使用 OS 的 `from_python_script` AST 编译器。
2. `validateAuthoringCandidate`：验证候选。
3. 用候选 `canonical_ir` 更新 DAG，再更新 `source_map`。

失败时保留用户当前代码和上一个有效 revision。不要在浏览器执行 Python，也不要用
前端正则或行号猜测重建 DAG。

## 起始点、断点与单步

- 节点卡片中的按钮是主入口；DAG 右键设起始点、双击切换断点是快捷方式。
- 起始点和断点同时投影到 DAG 与代码行。Python 使用 `source_map`，JSON 使用稳定
  `node_id` 的位置映射。
- 起始点之前或从该点不可达的节点在运行前置灰；运行创建后以 OS 的 `skipped` 投影为准。
- 断点表示“在该节点执行之前暂停”。蓝色暂停节点尚未申请资源、尚未进入设备动作队列。
- `step` 只放行一个逻辑 ready 节点；当前 v1 的 `step_over`、`step_into` 与 `step`
  语义相同，不代表已实现子工作流调用栈。
- 继续/单步只临时越过当前断点一次，不会清除断点。

### 七个运行控制动作

`src/utils/debugControls.ts` 是暂停、单步、步过、步入、继续、终止、急停的唯一前端
控制定义，集中维护命令名、启用条件、危险样式和用户提示。组件只能把动作发送给
`WorkflowRuntimePort.command`，不能在本地推进节点状态。

- `pause` 停止新节点 admission，当前运行中的物理动作收敛后才进入 `paused`。
- `terminate` 终止当前 run 并取消其未完成节点。
- `emergency_stop` 立即请求当前 run 的设备清理并停止后续调度；它不是全站硬件急停，
  UI 和测试都不得把它描述为硬件安全回路。
- OS 用 `stopReason`、`debug.terminate_requested` 和
  `debug.emergency_stop_requested` 保留两种停止原因，HTTP 命令成功不等于 run 已终止。

### 视觉语义

| 展示 | 含义 |
|---|---|
| 绿色 | OS 已报告 `success` |
| 蓝色 | `pausedBeforeNodeId`，暂停在节点执行前 |
| 橙色 | OS 已报告 `running` |
| 紫色标记 | 本次运行的起始点 |
| 红色标记 | 断点 |
| 灰色 | 起点前/不可达预览，或 OS 已报告 `skipped` |

状态必须有文字或标记，不能只靠颜色。选中态不得复用蓝色暂停语义。

## 主要文件

- `src/components/WorkflowPanel.tsx`：编写、保存、运行和调试的组合入口。
- `src/components/WorkflowDag.tsx`：只读拓扑投影及节点快捷交互。
- `src/components/WorkflowNodeCard.tsx`：节点状态、起始点和断点的可访问入口。
- `src/utils/canonicalWorkflow.ts`：Canonical revision 与 UI 投影辅助。
- `src/utils/parseWorkflowJson.ts`：Cloud JSON 的严格识别、Canonical v2
  迁移和兼容投影。
- `src/utils/debugControls.ts`：七个调试动作的命令、启用矩阵与文案。
- `src/utils/parseWorkflow.ts`：画布所需的只读解析。
- `src/hooks/useWorkflowDag.ts`：ReactFlow 布局与视图状态。

## Cloud JSON → Canonical v2

工具栏的“导入 JSON”以 Canonical v2 为第一识别顺序；如果不是 Canonical，
则自动识别旧 Cloud `data.nodes/data.edges` 导出并在内存中严格迁移。转换成功后：

1. 代码编辑器立即替换为格式化后的 Canonical v2，不再保留第二套可运行文档。
2. `device_name + template_name` 组成 `action_ref`。
3. `param` 逐项成为 tagged literal binding。
4. `ready → ready` 成为 control edge；非 `ready` handle 成为同时匹配
   `input_bindings` 的 data edge。
5. `pose.position` 只进入 `layout.nodes`，不进入执行内容哈希。
6. 立即调用当前 Profile 的 OS/backend 校验；只有当前服务真实注册了 action 且
   参数 schema 匹配，后续保存或运行才会通过。

迁移必须 fail-closed。重复 UUID、悬空边、依赖环、禁用节点、Cloud Group、
混合控制/数据 handle（包括没有显式分支条件契约的 `true/false → ready`）、
同一输入的多数据源，以及字面量与数据边争用同一输入时，都明确拒绝，不能猜测后
生成可运行载荷。`parent_uuid` 仅是 Cloud 画布分组信息，迁移时展平并向用户显示
警告。

浏览器 E2E 使用 `e2e/fixtures/host-node-test-latency` 声明 action contract，
再由真实 offline local bridge 完成导入校验和整图运行；该 Profile 只是测试夹具，
不能作为生产 Edge 的注册方式。

## 修改检查

```bash
pnpm --filter @unilab/workflow-editor typecheck
pnpm --filter @unilab/workflow-editor test
pnpm test:e2e:workflow
pnpm test:e2e:workflow-debug
pnpm test:e2e:workflow-actions
```

涉及运行和调试时，E2E 必须连接真实 v1 local bridge/OS，且检查浏览器
`console.error` 与 `pageerror` 均为空。
