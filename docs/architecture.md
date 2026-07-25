# 前端架构

## 原则

- `uni-lab-fe` 是唯一长期维护仓库。
- `kernel-web` 是唯一 renderer，使用 Vite + React 19，不做 SSR。
- Electron 只拥有 main、preload 和桌面打包能力。
- 业务数据归所属 package，应用只组合能力。
- Cloud、本地 Go 和本地 Python OS 遵循同一接口规范，通过
  `BackendConfig` 选择具体服务地址和鉴权方式。
- Pascal Editor 保持上游依赖，Uni-Lab 扩展不进入上游源码副本。
- 工作流引擎以 `uni-lab-fe/packages/workflow-editor` 为唯一实现，不保留或
  迁移 Uni-Lab-Cloud 的工作流画布与 authoring engine。

## 依赖方向

```text
apps/kernel-web
  ├─ integrations/lab-workbench
  │    ├─ panel-runtime
  │    ├─ services
  │    ├─ material
  │    ├─ workflow-editor
  │    └─ pascal-host + pascal-lab-plugin
  └─ app-shell + design-system

apps/desktop ── packages kernel-web as its renderer input
```

`panel-runtime` 不导入任何业务 package。`material`、`workflow-editor`
和 Pascal 相关包也不彼此调用；跨业务动作由
`apps/kernel-web/src/integrations/lab-workbench` 组合。

## 状态所有权

| 状态 | 所有者 | 实现 |
| --- | --- | --- |
| 服务端缓存、请求状态 | `services` 的消费者 | TanStack Query |
| 后端选择与连接状态 | `kernel-web` | React context |
| panel 布局文档 | `panel-runtime` | 纯 reducer + storage port |
| 物料文档与编辑历史 | `material`（目标） | feature store |
| 工作流文档、画布与编辑历史 | `workflow-editor` | Uni-Lab FE 内部引擎 |
| Pascal 场景内部状态 | Pascal Editor | 上游 editor store |
| 组件临时状态 | 对应组件 | React local state |
| 跨 panel 选择、高亮、定位意图 | `kernel-web/integrations` | Zustand vanilla store |

跨 panel store 只保存 ID 和交互意图。例如工作流步骤选择物料时，工作流
panel 写入 `selectedMaterialIds`，2D 和 3D panel 订阅同一字段并高亮；
物料实体、工作流 JSON 和场景文档不会复制到该 store。

## 工作流边界

`packages/workflow-editor` 同时拥有工作流模型、编辑状态、代码视图和 DAG
画布，是仓库内唯一工作流引擎。Cloud 的 workflow canvas、revision
document store、canvas controller 和相关 Redux 状态均不进入迁移范围。

Cloud、本地 Go 或本地 Python 后端返回的工作流数据如有字段差异，由
`services` 或应用 adapter 转换为内部工作流模型；不能为了兼容某个后端
再引入第二套画布或编辑状态。

## Panel 调用机制

`panel-runtime` 提供四个 port：

- registry：panel 定义。
- renderers：根据 panel 类型解析 renderer。
- scope：为 renderer 提供当前 `Services` 和交互 store。
- storage：读取和保存布局文档。

应用侧的 `useLabPanelAdapter` 实现这些 port。这样 panel 之间不通过
组件 ref、DOM 事件或全局 Redux 互调，新增 package 也不需要修改
`panel-runtime`。

## Pascal 边界

`pascal-host` 直接承载固定版本的 `@pascal-app/editor`，不复制
`pascalorg/editor` 源码。上游仍声明 Next peer，但项目只使用客户端组件；
Vite 用薄的 `next/image`、`next/link` 兼容组件满足上游导入，不安装 Next，
也不增加 SSR。

`pascal-lab-plugin` 是防腐层，负责：

- 注册 `lab-device`、`lab-table` 和层级节点及其 renderer/capability。
- 在 Cloud/ROS 的 Z-up、毫米单位与 Pascal/Three 的 Y-up、米单位间转换。
- 加载 XACRO、URDF、GLTF/GLB、STL、FBX 和 OBJ 模型。
- 把物料节点转换为 Pascal scene graph，并将保存结果转换回物料更新。
- 保存挂载点元数据和局部变换，提供挂载矩阵、吸附及链接查找算法。

```text
material graph（业务事实）
        │ materialSceneBridge
        ▼
Pascal scene graph（编辑投影）
        │ Pascal Editor store
        ▼
save -> MaterialNodeUpdate[] -> material graph/service
```

Pascal store 只拥有相机、选中、编辑中的 scene graph 等 3D 会话状态，不成为
第二份物料业务真相。跨 panel 只广播 material ID 与 scene object ID。
上游升级只允许修改依赖版本、Vite 兼容层和 host/plugin 适配，不允许把
Uni-Lab 业务代码写进上游副本。

当前 `SceneWorkbench` 用本地示例图和 localStorage 验证完整编辑闭环；接入
实验室 material graph 后，应由 `material` feature store 取代这层临时状态，
而 Pascal host/plugin 无需改动。

## Services

`packages/services/src` 保持扁平：

```text
backends.ts          # BackendConfig 与默认配置
http.ts              # fetch、超时、鉴权、统一错误
laboratory.ts        # 设备、资源与任务
materials.ts         # 物料模板与图保存
realtime.ts          # 实时连接生命周期
createServices.ts    # 当前 BackendConfig 的服务集合
ServicesProvider.tsx # Services + QueryClient 生命周期
```

这里不包含 Redux slice、Toast、React 业务 hook 或页面状态。
