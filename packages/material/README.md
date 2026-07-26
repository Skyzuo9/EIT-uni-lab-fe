# Material

`@unilab/material` 是前端 Material Graph 的领域包。它拥有统一领域类型、规范化 store、
编辑命令与 undo/redo，并把同一份图投影到 2D 与 2.5D。3D 由 Pascal adapter 消费同一
领域图，不能建立第二份物料状态。

## 领域模型

一个可渲染物料由 `MaterialAggregate` 表示，核心包括：

- 稳定的 material ID、名称、类型和层级关系；
- `placement`：`world`、`parent` 或 `site` 三种互斥定位；
- 静态 `localPose`，单位统一为毫米和角度；
- `rendering`：2D/SVG/3D 模型元数据；
- 领域 `Site`：设备上的可安装位置，例如 deck slot；
- revision 与服务能力，用于安全写入和冲突处理。

默认 anchor 为 root。挂到 parent 的 child 使用 parent 局部坐标；挂到 Site 的物料采用
follow-site。高频关节 pose 不写回静态 `relative_position`，也不驱动 ReactFlow 重渲染。
关节流缺失时 3D 可以回退 URDF 初始值。

`well` 与 `tip-spot` 当前可能出现在 OS 兼容投影中，但它们不是长期领域 `Site`。
新代码不得依赖其 `Site` 身份；后续应迁入容器内容/耗材自身模型。

## 状态分层

- TanStack Query：服务端图快照、加载、失效与错误。
- Zustand：当前规范化 Material Graph 和编辑会话。
- zundo：已确认本地命令的 undo/redo 历史。
- kernel workbench interaction store：只保存跨 panel 的选择/悬停/高亮 ID。
- Pascal/Three runtime：只保存渲染对象和高频关节态。

undo 是一个新的反向业务命令，不是只改本地 UI。若 `add` 已同步 backend/edge，随后
undo 必须发送对应 delete；失败时保留可解释的 pending/error 状态。服务没有 revision、
幂等键和补偿语义时，写能力必须标为不可用。

## 文件导航

- `src/domain.ts`：纯领域类型、标识符、placement 与端口契约。
- `src/store.ts`：规范化 Material Graph store。
- `src/undo.ts`：zundo 历史边界。
- `src/geometry.ts`：坐标和尺寸转换。
- `src/rules.ts`：领域约束。
- `src/templateMaterial.ts`：模板创建时的一次性物化；创建后不跟随模板变化。
- `src/react-flow/`：2D floorplan/ReactFlow 投影。
- `src/oblique/`：正面斜二测 2.5D SVG 投影。
- `src/MaterialWorkbench.tsx`：物料工作台入口。

试剂、样品和容器内容优先进入对应后端表；其他低频状态进入
`material_state_history`。不要重新增加通用 `data` 袋来承载所有业务。

## 渲染约束

- 2D、2.5D、3D 和 split 必须共享同一 Material Graph、选择与 tag 语义。
- 2D floorplan 可与 ReactFlow 叠加，但不能制造后端不存在的 site 或尺寸。
- 2.5D 使用通用 SVG 平面图、统一投影和真实高度处理遮挡，禁止测试案例定制。
- 每个设备可常驻浮动 tag；普通物料在 hover/selection 时显示。
- 所有尺寸来自服务/模型元数据；缺失时明确显示降级，不得用“看起来合适”的数据冒充。

## 服务端边界

领域包通过端口接收数据，不知道当前是本地 Go、本地 Python OS 还是云 Profile。
当前能力差异及 OS/Go 接口语义见
[`../services/README.md`](../services/README.md)。

## 绝对不能做

- 不得直接 `fetch`、读取环境变量或分支 Profile 名称。
- 不得让各视图各自拥有 Material Graph。
- 不得把 ReactFlow node 或 Three.js object 当作领域对象持久化。
- 不得在前端创建或删除 Site。
- 不得把高频 joint 数据写回静态 placement/state history。
- 不得把模板更新自动传播到已创建物料。

## 验证

```bash
pnpm --filter @unilab/material typecheck
pnpm --filter @unilab/material test
```

视图变更还必须运行真实 OS 的 material E2E，核对 floorplan/孔板尺寸、2.5D 遮挡、
Pascal 原生网格与通用自适应相机。
