# @unilab/workflow-editor

Uni-Lab 前端唯一的工作流引擎与编辑器，源自 `uni-lab-fe` 当前实现。

该 package 拥有工作流文档、代码编辑、DAG 画布和编辑状态。不得引入
Uni-Lab-Cloud 的 workflow canvas、revision store、canvas controller 或
Redux 状态。不同后端的工作流数据必须先通过 `services`/app adapter 转换为
本 package 的内部模型。

## 它负责什么

- 在 Python Draft 与 OS-owned Authoring Graph 画布之间维持单编辑权。
- 用同一个持久 Authoring aggregate 驱动代码、DAG、Draft、Candidate 与 Apply。
- 展示完整控制流 DAG，包括 branch、join 和分支边。
- 在原节点卡片、DAG 和代码 gutter 中预览 Debugger 起点与断点配置。
- 消费 OS/backend 的 WorkflowTask、WorkflowNodeJob、feedback 与全局 SSE
  invalidation 投影，展示逐节点结果和异常。

它不负责选择 backend、拼接 URL、解释用户 Python 或执行 DAG；这些能力分别属于
应用壳、`@unilab/services` 和 OS/backend。

## 单一数据流

```text
OS Workflow Authoring aggregate
        │
        ├─ parse/project ───────────────► ReactFlow DAG
        ├─ generate-python (OS) ────────► Python + source_map
        ├─ Draft PUT + Apply (OS) ──────► persisted revision
        └─ create WorkflowTask ─────────► OS-owned snapshot + Jobs

Python edit ── Draft PUT (双 CAS) ───────► server-owned Candidate
```

ReactFlow 的 `nodes`/`edges` 不是保存或执行输入。普通 `normal | step` 执行只发送
Workflow UUID、run mode、input 和 metadata；OS 从已 Apply 的持久 Graph 建立
WorkflowTask snapshot 与 Jobs。Debugger 起点/断点仍只保留在现有 UI 中做会话预览，
等待独立 Debugger Interface 后再接线，不能混入普通 Task payload。

## Python / 画布编写与文件导入

代码模式中，Python 是唯一可写表示。保存完整源码时调用 Workflow-scoped Draft PUT，
并携带观察到的 Draft hash 与 Workflow revision；只有 OS 返回的 Candidate 才能应用。

画布模式中，Graph 是唯一可写表示，Python 只读。画布保存先调用
`generateWorkflowAuthoringPython`，展示完整 Python 差异；用户明确接受后才执行
Draft PUT。Apply 始终只发送 server-issued `candidate_hash`。

UI1E 在同一个持久工作台中复用原有文件选择 hook：

- “导入 Python”把 `.py` 放入当前 Workflow 的代码脏态，随后仍走 Draft → Candidate
  → Apply；如果 OS 规范化了源码，必须再接受完整差异并保存。
- “导入 JSON”只接受当前 Workflow 的 `WorkflowAuthoringGraph`、`graph` 包装或
  Authoring aggregate 中的 `candidate.graph` / `applied_graph`；随后由 OS
  `POST /api/v1/authoring/generate-python` 生成 Python。
- Canonical v2、旧 Cloud JSON 和属于其他 Workflow 的 Graph 当前均 fail closed；
  浏览器不猜测 Backend-shaped Graph，也不改变现有文档。

失败时保留用户当前代码和上一个有效 aggregate。不要在浏览器执行 Python，也不要用
前端正则、行号或旧 Cloud DTO 猜测重建 DAG。

## 起始点、断点与 WorkflowTask 控制

- 节点卡片中的按钮是主入口；DAG 右键设起始点、双击切换断点是快捷方式。
- 起始点和断点同时投影到 DAG 与代码行。Python 使用 `source_map`，JSON 使用稳定
  `node_id` 的位置映射。
- 起始点之前或从该点不可达的节点在运行前置灰；运行创建后以 OS 的 `skipped` 投影为准。
- 断点表示“在该节点执行之前暂停”。蓝色暂停节点尚未申请资源、尚未进入设备动作队列。
- 本地起始点/断点只用于 Debugger launch 预览；普通 `normal | step` Task 不携带它们。
- 共享 Runtime command 只有 `pause`、`resume`、`step`、`cancel`，HTTP 201 只表示
  durable accepted，UI 必须等待 REST/SSE 权威投影。

### 已退役的 Run 调试 transport

UI1D 已删除 `useWorkflowRun`、`useWorkflowDebug`、七动作 `debugControls`、静态
`sampleWorkflow`、旧 Run/WebSocket/polling 和平行 Legacy 工作台。真正的
step-over/step-into、Hold、run-to、terminate 等能力必须等待 OS-only Debugger
Interface；不得把它们映射回共享 WorkflowTask command 猜测语义。

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

- `src/components/WorkflowPanel.tsx`：只负责解析稳定 Workflow UUID 并进入持久工作台；
  没有有效 UUID 时 fail closed。
- `src/components/PersistentWorkflowAuthoringPanel.tsx`：Authoring、Task controller、原
  DAG/代码/Debugger/Output surface 的唯一生产组合入口。
- `src/runtime/WorkflowTaskController.ts`：Task/Jobs coherent projection、command、
  feedback cursor 和 SSE rehydration。
- `src/components/WorkflowDag.tsx`：只读拓扑投影及节点快捷交互。
- `src/components/WorkflowNodeCard.tsx`：节点状态、起始点和断点的可访问入口。
- `src/utils/canonicalWorkflow.ts`：Canonical revision 与 UI 投影辅助。
- `src/utils/persistentAuthoringGraph.ts`：持久 Graph 投影、画布改名和文件导入边界。
- `src/utils/parseWorkflowJson.ts`：已退出生产入口的旧 Cloud/Canonical 迁移辅助；
  不得由持久 Authoring 导入入口调用。
- `src/utils/parseWorkflow.ts`：画布所需的只读解析。
- `src/hooks/useWorkflowDag.ts`：ReactFlow 布局与视图状态。

## 旧 Cloud JSON → Canonical v2

以下是退役入口曾采用的迁移语义，仅保留给显式离线迁移工具参考；当前生产工具栏
不会自动识别旧 Cloud `data.nodes/data.edges`，也不会把结果导入持久 Authoring。

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

旧 Cloud 导入/临时 Run 工作台已从生产入口退役。保留的迁移函数只能用于显式
Authoring 导入转换，不能恢复 Cloud panel、临时 DAG 执行或第二份 Workflow authority。

## 修改检查

```bash
pnpm --filter @unilab/workflow-editor typecheck
pnpm --filter @unilab/workflow-editor test
pnpm test:e2e:workflow
pnpm test:e2e:workflow-final-gate
```

涉及运行和调试时，E2E 必须连接真实 v1 local bridge/OS，且检查浏览器
`console.error` 与 `pageerror` 均为空。
