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

`well` 不是领域 `Site`。每个孔是由父孔板管理的真实子 Material，通过 parent
placement 进入同一 Material Graph，并使用稳定 component key（例如 `A1`）定位。
孔容器可以承载试剂或样品，但不能独立移动、重命名或管理生命周期。`tip-spot`
当前仍不进入长期领域模型。

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
  缺少专用物理外形时使用语义默认卡；优先读取
  `config.presentation/resourceConfig/source`，再兼容旧图标识符，并按
  “控制节点 / 仪器设备 / 物料节点”显示图标与名词。
- `src/oblique/`：正面斜二测 2.5D SVG 投影。
- `src/MaterialWorkbench.tsx`：物料工作台入口。
- `src/MaterialTreeSidebar.tsx`：由同一 store 派生的左侧父子目录树。
- `src/MaterialTemplateLauncher.tsx`：右上“仪器设备/物料耗材”模板入口；能力
  不可用时显式禁用，不能用静态假数据伪装。
- `src/MaterialTemplateLibrary.tsx`：按设备/耗材过滤的模板目录与单实例创建入口。

模板目录由 Edge Registry 提供。TanStack Query 一次获取全量轻量 summary，UI 在本地
搜索、分类和计数；只有用户选中某一项时才懒加载 geometry、container layout、配置 schema
与显式资源。Query key 必须包含 Profile/实际 Edge 地址和 scope，切换连接后不能复用旧
端点目录。

模板状态处理：

- `ready`：可展示详情，但是否能创建仍以 `creation.available` 和 capability 为准；
- `unresolved`：显示原因并禁用创建；
- `stale=true`：显示缓存/重连提示，允许浏览，所有创建禁用；
- 无缓存且服务失败：显示结构化错误与重试，不回退到 Cloud 或 bundle 静态模板。

模板只是类型目录，不进入 Material Zustand store；创建成功后的独立
`MaterialAggregate` 才进入实例图。列表入口必须位于 Pascal floorplan overlay 之上并能
真实点击，不能只保证视觉上可见。

试剂、样品和容器内容优先进入对应后端表；其他低频状态进入
`material_state_history`。模板中的旧 `config_info.liquids` 只能作为兼容元数据，
创建实例时不得据此默认填充 Water 或其他内容。不要重新增加通用 `data` 袋来承载
所有业务。

## 渲染约束

- 2D、2.5D、3D 和 split 必须共享同一 Material Graph、选择与 tag 语义。
- 2D floorplan 可与 ReactFlow 叠加，但不能制造后端不存在的 site 或尺寸。
- `num_rails` 声明的 Hamilton R1…Rn rail 是台面背景几何，不是独立安装位：
  2D 只显示弱化轨道，2.5D 不生成 Site 和 Site 标签。
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
- 不得把模板 summary 与 Material instance 混存，或在 stale/unresolved 状态创建。
- 不得用强制点击的 E2E 掩盖 ReactFlow/Pascal overlay 对模板入口的事件拦截。

## 验证

```bash
pnpm --filter @unilab/material typecheck
pnpm --filter @unilab/material test
pnpm test:e2e:material-create
pnpm test:e2e:materials
```

视图变更还必须运行真实 OS 的 material E2E，核对 floorplan/孔板尺寸、2.5D 遮挡、
Pascal 原生网格与通用自适应相机。
