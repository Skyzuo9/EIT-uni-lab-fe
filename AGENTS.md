# AGENTS.md

本文件约束 `uni-lab-fe` 仓库中的开发与调试。子目录若有更具体的
`AGENTS.md`，应同时遵守；发生冲突时，以更接近目标文件的规则为准。

## 仓库与应用边界

- 本仓库是前端唯一长期维护仓库，使用 pnpm workspace。业务能力进入
  `packages/*`，`apps/*` 只做应用组合、路由、运行时装配和部署入口。
- `apps/kernel-web` 是唯一 renderer，使用 Vite React SPA；`apps/desktop`
  只是 Electron main/preload/打包外壳，直接复用同一 renderer。
- 不使用 SSR，不引入 Next 作为第二应用框架。Pascal 上游少量
  `next/image`/`next/link` import 只允许由 Vite compatibility shim 解决。
- 一个业务事实只能有一个 owner。跨 panel 交互只传稳定 id、selection、
  highlight 和 command intent，不复制 Material、Workflow 或 Pascal 场景实体。

## 物料架构原则

- `packages/material` 拥有 Material domain type、Zustand authoring store、
  undo/redo、规则与 2D/2.5D UI；`packages/services` 拥有 OS/backend adapter；
  `apps/kernel-web/src/integrations/lab-workbench` 只组合 panel 和跨 panel
  selection/highlight。
- `MaterialAggregate` 是前端物料图的唯一业务投影。React Flow、2.5D SVG 和
  Pascal scene 都从同一批 aggregate 派生，不得各自保存第二份物料实体或位置。
- 所有持久坐标使用毫米，旋转使用 XYZ degree。placement 只使用
  `unplaced | world | parent | site`；parent/site 下的局部坐标由 adapter
  明确转换，渲染器不得猜测坐标系。
- 默认 anchor 为 `root`。挂在 site 上的物料采用 follow-site：site 所在 link
  实时运动时，子物料在 3D 中跟随；不得为了跟随运动而高频改写 site 或静态
  relative position。
- `site` 表示可承载另一个物料的安装位、台面位或 hotel slot。well 与 tip spot
  是 labware 内部结构，不是长期 domain Site；当前 local OS 读投影中的兼容形态
  只能用于展示，不得据此扩展 Site CRUD 或业务规则。
- 试剂、样品、容器内容优先进入对应后端表；通用时序状态进入
  `material_state_history`。不要恢复无边界的 `material.data` 作为万能状态袋。
- 高频关节状态走独立 realtime 通道，只影响 Pascal/3D 需要更新的 link；
  React Flow 和 2.5D 不订阅关节帧。实时状态缺失时允许回退 URDF 初始关节值。
- 从模板创建后，物料是独立实例；除非未来另有明确版本迁移协议，不得因模板更新
  隐式改写既有物料。
- site 的新增/删除不是当前前端能力。任何 create/move/attach/detach/undo
  必须先有带 revision、幂等键和补偿语义的统一命令契约，不能拼接现有行级 CRUD。

## 物料服务与 capability

- UI 只能依赖 `packages/services/src/materials.ts` 暴露的 port，不得直接
  `fetch` OS 或 Go backend，也不得按 profile id 在组件中分支。
- 路径同名不代表语义相同。当前 OS local server 的 `/api/v1/materials`
  是只读 MaterialAggregate 投影；当前 Go backend 的同名接口是持久化 Material
  行 CRUD，RelativePosition、Site 与 StateHistory 另有接口。
- `ServerCapabilities` 描述当前已完整实现的语义，不描述规划。未知 profile
  deny-by-default；按钮和命令必须按 capability 明确降级，不能收到 404 后再猜。
- 本地 OS 与本地 Go backend 使用 singleton material scope，不要求
  `laboratoryId`；只有未来云端多实验室 scope 才能要求该字段。

## 2D、2.5D 与 Pascal 3D

- Pascal Editor 保持外部、固定版本依赖。`pascal-host` 只加载上游，
  `pascal-lab-plugin` 只实现 Uni-Lab node、模型与坐标适配；禁止 vendor/fork
  一份 Pascal renderer 到本仓库。
- 2D/3D/Split 使用同一个 Pascal Editor 的原生 view mode。2D 可叠加
  React Flow floorplan；不得创建第二个隐藏 3D scene 来实现 Split。
- 2.5D 是 `packages/material` 的通用 SVG 投影。尺寸、site、占用和标签来自
  Material Graph；可以从物理外包络画空层架，但不能伪造 occupied material、
  site id、孔位或设备数据。
- 3D 保留 Pascal 原生 scene、网格、灯光和 post-FX。不得为某个测试模型覆盖
  scene 背景、把网格画到模型之上，或写死 camera target/distance。
- “适配场景”必须从当前可见对象的 bounding volume 通用计算，不得按
  `plr_test`、设备名称或资源路径设置 case-specific camera。
- 设备标签可常显，普通物料 hover/selected/highlight 时显示；2D、2.5D 和 3D
  使用同一 material id 驱动选择和高亮。

## 工作流架构原则

- `packages/workflow-editor` 是前端工作流文档、代码编辑、DAG 画布和调试交互的唯一所有者。
  不得把 Cloud 旧版 canvas、revision store、canvas controller 或 Redux 工作流状态复制进来。
- `WorkflowRevision` schema v2（Canonical v2）是保存、校验和执行的唯一事实源。
  ReactFlow 的 `nodes`/`edges` 只是可视化投影，不能反向充当执行载荷。
- 前端访问本地 OS 和新 backend 必须共用 `packages/services/src/workflow.ts` 定义的
  `WorkflowRuntimePort`。组件不得直接 `fetch` 工作流接口，也不得为 OS/backend 各维护一套请求结构。
- 一次运行必须提交完整、不可变、包含 branch/join 等控制节点的 DAG。`start_node_id` 和
  `breakpoints` 是运行配置，不得通过删除节点、裁剪边或重排 DAG 来实现。
- OS/backend 是运行状态、逐节点结果、调试状态和异常的权威来源。前端只能展示或做运行前范围预览，
  不得乐观伪造 `success`、`failed`、`skipped`、`paused` 或运行终态。

## JSON / Python 编写与同步

- JSON 与 Python 是同一个 Canonical revision 的两种编写视图，不是两份独立工作流。
- JSON → Python 必须调用 `/api/v1/authoring/generate-python`；Python → Canonical 必须调用
  `/api/v1/authoring/compile`，并在应用、保存或执行前调用 `/api/v1/authoring/validate`。
- Python 转换必须使用 OS 的 `from_python_script` AST 编译路径。浏览器中绝对禁止
  `eval`、`exec` 或自行解释用户 Python，也不得伪造 revision id、诊断结果或 source map。
- Python 视图的代码标记、选中节点、起始点和断点使用 OS 返回的 `source_map` 对齐；
  JSON 视图使用稳定的 `node_id` 对齐。重新编译后必须按新 source map 重映射。
- 所有控制节点都必须保留稳定 `node_id` 并可被定位。生成 Python 时产生的隐式 join 也必须在
  source map 和代码注释中可见，不能因其不是显式设备调用而丢失。
- 编译或校验失败时保留当前编辑内容，显示结构化诊断，且不得用失败候选覆盖最后一个有效 revision。

## 调试器与 DAG 展示

- 起始点和断点必须在 DAG 与代码两个视图中同步展示，并提供可发现、可访问的按钮；
  右键设起点、双击切换断点只能作为快捷方式，不能是唯一入口。
- 设起始点后，起点之前及从该起点不可达的节点在运行前预览中置灰；真正运行后以 OS 返回的
  `skipped` 为准。起点之外的断点不得随本次运行下发。
- 断点语义是“节点被调度、申请资源、进入设备动作队列之前暂停”，不是节点执行完成后暂停。
- 调试命令统一走 `POST /api/v1/runtime/runs/{run_id}/commands`。命令名和载荷不得在组件中另造：
  `set_breakpoints`、`pause`、`continue`、`step`、`step_over`、`step_into`、`run_to`、
  `terminate`、`emergency_stop`。
- 颜色不得混用：
  - 绿色：节点已成功 `success`。
  - 蓝色：暂停在该节点之前，节点尚未执行。
  - 橙色：节点正在 `running`。
  - 紫色：所选起始点。
  - 红色：断点。
  - 灰色：起点前/不可达或 OS 已报告 `skipped`；文字标签要区分两者。
- 颜色只能作为辅助信息。状态必须同时通过文字、CSS class/图标和可访问标签表达。
  “选中节点”的蓝色绝对不能与“正在运行”混为一谈。
- `packages/workflow-editor/src/hooks/useWorkflowDebug.ts` 只是本地 UI 状态辅助，不能作为真实运行状态机；
  运行中状态必须来自 `WorkflowRuntimePort` 的 run、node 和 event 投影。

## 统一接口边界

前端工作流只采用以下 v1 契约：

- `GET|PUT /api/v1/workflows/{workflow_id}/graph`
- `POST /api/v1/workflows:validate`
- `POST /api/v1/authoring/compile`
- `POST /api/v1/authoring/generate-python`
- `POST /api/v1/authoring/validate`
- `POST /api/v1/runtime/runs`
- `GET /api/v1/runtime/runs/{run_id}`
- `GET /api/v1/runtime/runs/{run_id}/nodes`
- `GET /api/v1/runtime/runs/{run_id}/events?after_seq=...`
- `POST /api/v1/runtime/runs/{run_id}/commands`
- `POST /api/v1/runtime/runs/{run_id}/cancel`
- `WS /api/v1/runtime/events?run_id=...&after_seq=...`

兼容 HTTP 端点只能留在 adapter/bridge 内部；新 UI 功能不得依赖 `/api/run`、
`/api/runtime/local/*` 或 backend 私有接口。旧 Cloud panel
`/ws/workflow/{uuid}` 已从 OS 删除，禁止重新引入 client、proxy 或协议类型。

## 异常与实时事件

- WS 断开时可从最后一个 `seq` 用 REST 补拉；事件按单调递增 `seq` 去重和续接。
- HTTP 接受、WS 发送成功或命令返回，不等于节点或 run 成功。终态只能由后续权威投影确认。
- `dispatch_unknown`、`reconciling`、资源等待、取消中和结构化 problem detail 必须如实显示，
  不能折叠成“失败”或“成功”。
- 用户可见错误应包含可行动的信息；不得吞掉 Promise rejection、WebSocket 解析错误或
  authoring diagnostics。E2E 中出现 `console.error`、`pageerror` 应视为失败。

## 绝对不能做

- 不能新增第二套 renderer、第二个 Material store 或第二份 Pascal scene。
- 不能让组件直接请求 OS/backend，或以 `backend.id` 分叉业务组件。
- 不能把 Go backend 行级 CRUD 冒充已经实现的统一 Material Graph 写协议。
- 不能把 well/tip spot 固化为长期 Site 契约。
- 不能用高频关节帧改写 relative position/site，或让 React Flow 随关节帧重渲染。
- 不能为测试场景硬编码模型尺寸、site、occupancy、camera 或颜色。
- 不能修改/复制 Pascal 上游源码来绕过 host/plugin 边界。
- 不能从 ReactFlow 图生成一个有损 DAG 后直接下发。
- 不能只下发“从起始点开始”的裁剪图；必须发送完整 Canonical revision。
- 不能在浏览器执行用户 Python。
- 不能靠前端计时器模拟 OS 的逐节点成功、断点命中或单步完成。
- 不能为 OS 和 backend 分叉组件逻辑或复制类型；差异只能收敛在 service/backend adapter。
- 不能用绿色表示“选中”，不能用蓝色表示“运行中”。
- 不能手工编辑 `pnpm-lock.yaml`；依赖变更使用 pnpm。
- 不能为了通过测试移除控制节点、source map、错误状态或真实 OS 联调断言。

## 验证

从仓库根目录至少执行与变更相符的命令：

```bash
pnpm typecheck
pnpm test
pnpm build:web
pnpm build:desktop
pnpm test:e2e:materials
pnpm test:e2e:workflow
pnpm test:e2e:workflow-debug
```

物料/场景变更必须至少覆盖：真实 OS Material API、真实模型资源 200、2D/2.5D/
3D/Split 切换、相同孔位尺寸、site key、通用 camera fit、无 `console.error`/
`pageerror`。Xvfb 无法运行 Pascal post-FX 时，只能在测试 URL 使用 Pascal 官方
diagnostic escape hatch，不能改产品默认 scene。

工作流 E2E 应连接真实 local bridge/OS v1 契约，不得用路由 mock 证明“端到端成功”。
测试和截图至少覆盖：完整 DAG、控制节点、JSON/Python 往返、起始点置灰、断点暂停、
橙色运行态、绿色成功态、单步、异常和终止。
