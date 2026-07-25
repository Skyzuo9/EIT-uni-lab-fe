# Uni-Lab-Cloud 迁移记录

迁移源为 PVC 中 `Uni-Lab-Cloud` 的 `codex/w1-w2-kernel-alpha` 分支。
开始本轮迁移时的 HEAD 为 `9f915b29`；读取的是该分支包含未提交最新修改的
工作树，源仓库没有被修改。

初始迁移范围只包含 `uni-lab-fe`。后续 E2E 验证为 Uni-Lab-OS 本地桥增加了
统一的只读 Material 查询，但没有修改 `uni-lab-backend`，也没有开放服务端
尚未具备的原子命令、补偿或设备控制能力。`Services.capabilities` 静态声明
各 adapter 的实际能力；feature 只按 capability 降级，不按 Server 类型分支，
也不通过 404 探测。

## 已完成

- 将原 renderer 移到 `apps/kernel-web`。
- 将 Electron main、preload 和构建资源移到 `apps/desktop`。
- 建立 pnpm workspace 和统一 TypeScript 配置。
- 从原 `uni-lab-fe` 拆出 design system、app shell、code editor、material
  和 workflow editor。
- 确认原 `uni-lab-fe` 工作流引擎为唯一实现；Cloud 工作流画布不迁移。
- 从 Cloud 当前工作树迁入独立的 `panel-runtime`。
- 建立 BackendConfig、Services、默认后端切换和 QueryClient 生命周期。
- 为 Services 建立静态、deny-by-default 的 capability matrix、统一
  capability key、可展示禁用原因和 `UnsupportedCapabilityError`。
- 移除 Services 中旧 Cloud Material 模板/整图保存路径，以显式 singleton
  scope 接入 Local Go 新 Backend 的 ResourceTemplate 分页列表和详情，并只
  打开 `material.readTemplates`；其他 Material Aggregate、joint realtime 与
  Edge compensation 能力继续关闭。
- 建立 application-neutral panel port 与 `lab-workbench` 应用 adapter。
- 建立只传递 ID/意图的跨 panel Zustand store。
- 用 `PanelLayoutRenderer` 替换 Material/3D/Workflow 的固定直连入口，接入
  布局持久化，并让 Workflow、React Flow、Pascal 通过 material ID
  选择/高亮。
- 建立唯一应用级 Material Store、Profile scope 解析、revision action、
  graph index、拖拽 preview 与 zundo authoring history；2D/3D 共享同一
  Store，不复制实体。
- 实现 React Flow Material Canvas、父级/Site 矩阵投影与拖拽逆变换；节点
  `data` 只保存 `materialId`，不订阅关节流。
- 直接接入官方 `@pascal-app/*` 0.9.2，不迁入 Cloud 中修改过的 Pascal
  vendor，也不安装 Next 或引入 SSR。
- 建立 Vite Pascal host 与 Uni-Lab plugin 边界，并将 3D 面板改为动态加载。
- 迁入 `lab-device`、`lab-table` 节点、层级 renderer、选择/移动/旋转能力，
  以及顶视图和场景适配操作；Material 的复制/删除不交给 Pascal 私有命令。
- 迁入 XACRO、URDF、GLTF/GLB、STL、FBX、OBJ 模型运行时和资源释放逻辑。
- 迁入 Aggregate/scene 双向投影、Uni-Lab 与 Three 坐标单位转换、模型
  attach point 合并、挂载矩阵和最近挂载点计算；root 与 URDF link frame
  使用明确分离的换轴规则。
- 删除本地示例场景、scene localStorage、Cloud-shaped 3D DTO 与旧本地
  Material JSON/YAML 编辑器；Pascal 通过共享 Material Store 和上游
  `setScene` 同步。
- Electron 构建复用 `kernel-web` 的同一 3D renderer、样式和 Vite 兼容层。
- 按 Cloud 的模板创建行为提取纯物料逻辑：读取模板详情、生成唯一节点名、
  识别含液体孔位、注入默认液体并在创建前要求配置。
- Uni-Lab-OS 本地桥可通过 `--material-graph` 读取实验图，并提供统一
  `GET /health`、`GET /api/v1/materials` 与
  `GET /api/v1/materials/{uuid}`；Well/TipSpot 被投影为所属物料的 Site，
  revision 由设备图内容稳定计算，不建立第二份物料数据库。
- Local Python OS adapter 已打开 `material.readGraph`；2D React Flow 与
  Pascal 3D 从同一个 Material Store 读取，OS 模式保持只读。
- Playwright E2E 会分别启动 `plr_test.json` 和
  `plr_test_converted.json` 的真实 OS 本地服务，并验证两套场景同屏显示
  2D/3D、统一 API 返回值和浏览器无异常。

## 尚待接入

1. Local Go 和 Cloud 实现统一 Material Aggregate 读取；三个 Server 继续
   补齐原子 create/move/attach/detach、persistent undo 与 Edge compensation
   contract。对应写 capability 保持关闭，不试探请求、不回退旧 Cloud API。
2. 在后续 3D 专题中补齐挂载确认/取消、关节控制、控制租约、实时轨迹与
   `scene-runtime` 高频 frame buffer。静态 2D/3D 选择和高亮已经接通。
3. 为 Cloud laboratory workspace 接入 Laboratory 选择器；选择前不制造
   laboratory ID，非 Cloud Profile 始终使用 singleton scope。
4. 迁移剩余 Cloud 页面；`cloud-web` 在确有独立部署需求前继续保持占位。
5. 对确需保留的 Cloud 既有数据建立一次性离线 importer：优先保留
   Template、Material 和 Site UUID，支持 dry-run、checkpoint、幂等重跑、
   migration report 和冲突 ID map；不做运行时双写。

## 明确不迁移

- Cloud `packages/workflow-editor`。
- Cloud workflow canvas、revision document store、canvas controller。
- Cloud 工作流相关 Redux store 与旧 panel 内部通信实现。
- Cloud 中直接导入其 Redux、Next 路由和本地 alias 的 Pascal vendor 副本。
- 前端旧 Cloud Material 协议 adapter 和长期双写逻辑。

后续若需要读取 Cloud 工作流，只迁移接口 DTO 与转换逻辑，转换后的文档仍由
本仓库 `packages/workflow-editor` 负责编辑和渲染。

本轮迁移把 Material/2D/3D/Panel 的前端长期维护边界收敛完成。当前默认
Profile 中，Local Go 只开放模板读取，Local Python OS 只开放 Material Graph
读取；持久创建、移动和其他写操作仍明确显示 capability 不可用，不能用本地
状态冒充服务端成功。
