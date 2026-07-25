# Uni-Lab-Cloud 迁移记录

迁移源为 PVC 中 `Uni-Lab-Cloud` 的 `codex/w1-w2-kernel-alpha` 分支。
开始本轮迁移时的 HEAD 为 `9f915b29`；读取的是该分支包含未提交最新修改的
工作树，源仓库没有被修改。

## 已完成

- 将原 renderer 移到 `apps/kernel-web`。
- 将 Electron main、preload 和构建资源移到 `apps/desktop`。
- 建立 pnpm workspace 和统一 TypeScript 配置。
- 从原 `uni-lab-fe` 拆出 design system、app shell、code editor、material
  和 workflow editor。
- 确认原 `uni-lab-fe` 工作流引擎为唯一实现；Cloud 工作流画布不迁移。
- 从 Cloud 当前工作树迁入独立的 `panel-runtime`。
- 建立 BackendConfig、Services、默认后端切换和 QueryClient 生命周期。
- 建立 application-neutral panel port 与 `lab-workbench` 应用 adapter。
- 建立只传递 ID/意图的跨 panel Zustand store。
- 直接接入官方 `@pascal-app/*` 0.9.2，不迁入 Cloud 中修改过的 Pascal
  vendor，也不安装 Next 或引入 SSR。
- 建立 Vite Pascal host 与 Uni-Lab plugin 边界，并将 3D 面板改为动态加载。
- 迁入 `lab-device`、`lab-table` 节点、层级 renderer、选择/移动/旋转/复制/
  删除 capability，以及顶视图和场景适配操作。
- 迁入 XACRO、URDF、GLTF/GLB、STL、FBX、OBJ 模型运行时和资源释放逻辑。
- 迁入 material-scene 双向转换、Cloud/ROS 与 Three 坐标单位转换、模型
  attach point 合并、挂载矩阵和最近挂载点计算。
- 用本地示例场景和 localStorage 打通 Pascal 编辑、保存、重载闭环。
- Electron 构建复用 `kernel-web` 的同一 3D renderer、样式和 Vite 兼容层。
- 按 Cloud 的模板创建行为提取纯物料逻辑：读取模板详情、生成唯一节点名、
  识别含液体孔位、注入默认液体并在创建前要求配置。

## 尚待接入

1. 在选定 laboratory scope 后，将 material graph 的读取、增量更新与保存
   接到 `material` store 和统一 `services` 接口，替换当前 3D 面板的本地
   示例图。协议 adapter 必须同时支持 Local Go、Local Python OS 和 Cloud，
   不能在 Pascal 包中写死 Cloud WebSocket。
2. 把物料模板列表/创建操作接入 3D；保持 Cloud 已确认的模板创建语义。
3. 在后续 3D 专题中补齐交互层：拖拽放置、挂载确认/取消、关节控制与实时
   轨迹、2D/3D 双向高亮。底层坐标和挂载纯函数已经迁入，可直接复用。
4. 用 `PanelLayoutRenderer` 替换现有固定导航内容区，并迁移 Cloud
   panel adapter 的持久化和恢复测试。
5. 迁移剩余 Cloud 页面；`cloud-web` 在确有独立部署需求前继续保持占位。

## 明确不迁移

- Cloud `packages/workflow-editor`。
- Cloud workflow canvas、revision document store、canvas controller。
- Cloud 工作流相关 Redux store 与旧 panel 内部通信实现。
- Cloud 中直接导入其 Redux、Next 路由和本地 alias 的 Pascal vendor 副本。

后续若需要读取 Cloud 工作流，只迁移接口 DTO 与转换逻辑，转换后的文档仍由
本仓库 `packages/workflow-editor` 负责编辑和渲染。

本轮迁移把可复用的原 3D 内核放进长期维护边界；实时后端图谱、物料创建和
设备控制仍按上面的顺序接入，不能用本地示例状态冒充服务端数据。
