# Material、Scene 与实时状态设计

状态：Accepted
日期：2026-07-25
适用范围：`uni-lab-fe`、`uni-lab-backend`、Uni-Lab-OS 的物料与 3D 迁移

## 1. 目标

本文记录 Uni-Lab-Cloud 物料与 3D 能力迁入 `uni-lab-fe` 时已经确认的
长期设计。它约束前端 package、Go/Python/Cloud 后端接口、Pascal Editor
适配和 Uni-Lab-OS 实时数据上报。

核心目标：

- `uni-lab-fe` 是唯一长期维护前端仓库。
- Web 和 Electron 使用同一个 Vite renderer，不引入 Next 或 SSR。
- Local Go、Local Python OS 和 Cloud 遵循同一个新协议。
- 物料图是唯一业务真相，React Flow 和 Pascal 都是它的投影。
- 静态装配关系与高频运动学状态严格分离。
- React Flow 不消费关节流，机械臂运动不能触发物料画布重渲染。
- Pascal 保持上游可升级，Uni-Lab 语义只进入 host/plugin 防腐层。
- Material 编辑支持后端 revision、原子命令和可持久化的 undo/redo。

本轮交付边界：

- 只修改 `uni-lab-fe`。
- 不修改 `uni-lab-backend` 或 Uni-Lab-OS/Edge 代码。
- 本文中的 Backend/Edge schema、operation、ticket、lease 和 control channel
  是目标契约与未来前置工作，不代表本轮会在外部仓库实现。
- 前端可以先完成 package 边界、domain、Store、projection 和现有
  `push_joint_state` 接入；依赖缺失服务端能力的功能不能伪装成功。

## 2. 非目标

本阶段明确不做：

- 在本轮前端迁移中修改 Backend 或 Edge 仓库。
- 兼容 Uni-Lab-Cloud 旧物料协议。
- 迁移 Cloud 工作流画布、Redux store 或 revision document store。
- 引入第二套 renderer、Next 或服务端渲染。
- 让 React Flow 显示实时关节运动。
- 模板版本、模板升级或模板对既有 Material 的自动传播。
- CRDT、全局编辑锁或 Google Docs 式实时协作。
- Material Graph 的多客户端/多窗口结构同步。
- 通用 Material 删除、归档、恢复和硬删除语义；刚创建 Material 的受限
  `undoCreate` 补偿除外。
- 在前端新增、删除或 restore Material Site。
- 除 create provisioning/undoCreate 补偿外，把一般 Material 静态修改同步到
  Edge resource tree。
- 把原始高频 ROS 数据全量写入 `material_state_history`。
- Pascal 的轨迹、末端拖拽和完整 2D floorplan 交互；这些属于后续专题。

## 3. 仓库与 package

仓库使用 pnpm workspace 管理目标 monorepo。内部 package 通过
`workspace:` 协议依赖，只从各 package 的公开入口导入，不能通过相对路径
穿透到其他 package 的 `src` 内部。

目标结构：

```text
uni-lab-fe/
├── apps/
│   ├── kernel-web/             # 唯一 Vite React SPA / renderer
│   ├── desktop/                # Electron main、preload、打包
│   └── cloud-web/              # 未来云部署入口，当前占位
└── packages/
    ├── services/               # Backend Profile、HTTP/WS、业务服务
    ├── design-system/          # 主题 token 和通用组件
    ├── app-shell/              # 应用外壳
    ├── panel-runtime/          # 与业务无关的 panel 布局运行时
    ├── material/               # Material domain、store、2D 物料编辑
    ├── scene-runtime/          # 目标：高频关节/pose 热缓存与帧求值
    ├── workflow-editor/        # 唯一工作流引擎与画布
    ├── code-editor/            # CodeMirror 封装
    ├── pascal-host/            # Pascal 上游宿主
    ├── pascal-lab-plugin/      # Uni-Lab 场景适配
    └── testing/                # 跨包测试工具
```

`scene-runtime` 是目标 package，当前尚未创建。它存在的原因是高频运动学
状态既不能进入持久化 Material Store，也不能由 Pascal 私有，否则其他运行时
消费者无法共享同一状态契约。

依赖规则：

```text
apps/kernel-web/integrations
  ├── material
  ├── scene-runtime
  ├── pascal-host + pascal-lab-plugin
  ├── workflow-editor
  ├── services
  └── panel-runtime

material ─X─> scene-runtime
material ─X─> Pascal Editor store
panel-runtime ─X─> 任意业务 package
```

`material` 不依赖 `scene-runtime`，这是保证 React Flow 不受关节更新影响的
结构性约束。应用 integration 负责把 Material、Pascal、工作流和跨 panel
交互组合起来。

`packages/material/src` 内部保持扁平，不增加 `domain/`、`application/` 或
`coordinators/` 层级：

```text
packages/material/src/
├── types.ts          # Material、Placement、Site、Aggregate、命令类型
├── geometry.ts       # pose、matrix、坐标转换与挂载变换
├── rules.ts          # cycle、capacity、占用与 placement 纯校验
├── store.ts          # Zustand 状态、异步命令、订阅与生命周期
├── undo.ts           # zundo 配置和持久化 undo/redo 算法
├── react-flow/       # 2D 物料画布
└── index.ts          # package 公开出口
```

Pascal 相关投影属于 `pascal-lab-plugin`，不能放进 `material` 并形成反向依赖。

工作流编辑器和代码编辑器继续使用 `uni-lab-fe` 的设计语言及主题 token。
Cloud 页面迁入时只迁业务能力，不复制 Cloud CSS 或形成第二套视觉系统。

主题由 `design-system` 定义 semantic token 和可选主题集合，`app-shell` 负责
主题选择、持久化和应用。业务 package 只能消费 semantic token，不能硬编码
某个部署环境或 Cloud 旧页面的配色。主题切换是纯 UI 配置，不重建
Material、Workflow、Services 或 scene runtime 状态。

## 4. Backend Profile

应用切换完整 Profile，而不是单独切换一个 URL。目标类型：

```ts
type WorkspaceMode = 'singleton' | 'laboratory';
type ServerKind = 'edge-server' | 'backend-server';

interface BackendProfile {
  id: string;
  name: string;
  protocol: 'unilab/v1';
  serverKind: ServerKind;

  apiUrl: string;
  /** 可作为本地默认值；Server 签发的 RealtimeSession URL 优先 */
  realtimeUrl?: string;
  assetUrl?: string;
  auth: 'none' | 'token' | 'oauth';

  workspaceMode: WorkspaceMode;
}

type MaterialScope =
  | { kind: 'singleton' }
  | { kind: 'laboratory'; laboratoryId: string };
```

默认 Profile：

- Local Go：`backend-server + singleton`。
- Local Python OS：`edge-server + singleton`。
- Uni-Lab Cloud：`backend-server + laboratory`。

约束：

- `singleton` 请求不制造假的 `laboratoryId`。
- `laboratory` Profile 才要求选择 laboratory scope。
- 应用根据 Profile 构造 `MaterialScope`；feature/service 不接受可空
  `laboratoryId` 来同时表达两种模式。
- feature package 不判断 `local-go`、`local-python` 或 `cloud`。
- Profile 切换时销毁旧 Services、实时连接、Query cache、scene runtime、
  Material 编辑会话和 undo/redo 历史。
- 三种后端实现同一新协议；不在 Pascal 或 Material 中写旧 Cloud adapter。
- 一个 Profile 只连接一个逻辑 Server，HTTP 和 realtime 都由它提供。
- `edge-server` 由 Uni-Lab-OS 直接实现公开接口；`backend-server` 由
  Local Go/Cloud 实现同一公开接口，并在内部连接 Edge。
- feature package 不根据 `serverKind` 分支；它只用于连接诊断和配置界面。
- Profile 不保存长期 realtime 密钥。前端通过当前 Server 获取短期
  RealtimeSession，其 URL 可以覆盖 Profile 中的本地默认 `realtimeUrl`。

当前代码仍名为 `BackendConfig`，且没有 `serverKind` 和 `workspaceMode`。
实现阶段需要在不增加额外目录层级的前提下演进为上述 Profile 语义。

### 4.1 本轮 Capability 降级

本轮不修改 Server，因此统一 Services façade 显式声明实际可用能力：

```ts
interface ServerCapabilities {
  material: {
    readTemplates: boolean;
    readGraph: boolean;
    create: boolean;
    updateConfig: boolean;
    move: boolean;
    attach: boolean;
    detach: boolean;
    persistentUndo: boolean;
  };
  realtime: {
    pushJointState: boolean;
    setJointState: boolean;
    jointControlLease: boolean;
  };
  edge: {
    provisioning: boolean;
    undoCreate: boolean;
  };
}

interface Services {
  backend: BackendProfile;
  capabilities: ServerCapabilities;
  getCapabilityStatus(
    capability: ServerCapability
  ): { available: boolean; reason?: string };
  materials: MaterialGraphPort;
  realtime: RealtimePort;
}
```

`createServices(profile)` 根据当前 adapter 静态提供 matrix，不通过试请求或
捕获 404 探测。feature 只能判断 capability，不能判断 `serverKind`、Go、
Python 或 Cloud。不可用功能在 UI 中禁用并说明原因，Store action 再返回统一
`UnsupportedCapabilityError`。未来 Server contract 补齐后只打开 capability，
不改 feature 业务代码。

Capability 的布尔值代表已经确认的**完整目标语义**，不是“存在名称相近的
CRUD/WS 接口”：

| Capability | 为 `true` 的最低语义 |
|---|---|
| `material.readTemplates` | 可按当前 scope 分页读取 Template 列表和详情 |
| `material.readGraph` | 可无损读取 Material Aggregate、Placement、owned Sites 与 revision |
| `material.create` | 从 Template 原子创建完整 Aggregate，并返回 creation operation |
| `material.updateConfig` | 使用 expected revision 更新并返回新的权威 Aggregate |
| `material.updateSite` | 使用 expected revision 和字段白名单更新 owned Site |
| `material.move` | 支持完整 `Placement` union 与原子 revision 检查 |
| `material.attach` / `detach` | 服务端使用权威 runtime pose 原子换算、校验并提交 |
| `material.persistentUndo` | undo/redo 不是本地假成功，冲突和补偿结果均可确认 |
| `realtime.pushJointState` | 提供统一 `unilab/realtime-v1` joint frame |
| `realtime.setJointState` | 可发送真实关节命令并收到命令 ACK |
| `realtime.jointControlLease` | 实际 Edge 为最终租约权威，支持 acquire/renew/release |
| `edge.provisioning` | create side effect 有持久 operation、幂等与最终状态 |
| `edge.undoCreate` | 可按 creation operation 精确补偿并等待最终 commit |

基于本轮只读代码盘点，当前默认矩阵是：

| 默认 Profile | `readTemplates` | 其余 Material 8 项 | Realtime 3 项 | Edge 2 项 |
|---|---:|---:|---:|---:|
| Local Go | `true` | 全部 `false` | 全部 `false` | 全部 `false` |
| Local Python OS | `false` | 全部 `false` | 全部 `false` | 全部 `false` |
| Uni-Lab Cloud | `false` | 全部 `false` | 全部 `false` | 全部 `false` |

这不是说现有 Server 完全没有相关代码，而是它们尚未满足上表的新契约：

- 当前 Go Backend 的 ResourceTemplate 分页列表和详情已经由新 adapter 接入，
  因此只打开 `material.readTemplates`。它还有 Material、RelativePosition、
  Site 和 MaterialStateHistory 的行级 HTTP CRUD，但没有完整
  Aggregate/revision、Template 原子展开、hierarchical Placement、原子
  attach/detach、realtime WS 或 Edge compensation，所以这些相似接口不会
  打开其他 capability。
- 当前 Uni-Lab-OS 有 `/api/v1/ws/device_status` 的 1 Hz 设备状态广播，以及
  设备/资源/Job API；它不是 `push_joint_state`，也没有面向前端的统一
  Material Graph、joint command/lease 或 provisioning compensation API。
- 旧 Cloud Material/WS 接口被明确排除，不作为新协议的 capability 依据。

`packages/services/src/capabilities.ts` 是当前代码事实的唯一静态矩阵。未知或
自定义 Profile ID 采用 deny-by-default，必须由 adapter 明确声明后才能打开。
`getCapabilityStatus` 同时返回 UI 可展示的禁用原因；domain/store action 使用
同一个 key 做防御检查并抛出 `UnsupportedCapabilityError`。

本轮保持矩阵直接绑定稳定的 Profile `id`，不额外增加 `adapter` 或
`capabilityPreset` 字段。Profile 的 `name` 和 URL 可以修改而不改变能力；
复制为新 ID 或创建未知 Profile 时不会继承能力，仍按 deny-by-default 处理。
将来只有出现多个同协议自定义 Profile 的实际需求时再讨论抽离 preset。

矩阵控制的是服务端持久化/实时能力。当前离线 JSON 编辑和本地 Pascal 示例
场景可以继续使用，但必须明确标注为本地模式，不能因本地操作完成而显示成
Server 已提交。

## 5. Material 聚合

### 5.1 Material 不再有 `data`

目标 Material：

```ts
type MaterialId = string;
type MaterialTemplateId = string;

interface Material {
  id: MaterialId;
  sourceTemplateId: MaterialTemplateId;

  code: string;
  name: string;
  description?: string;

  /** 创建时解析完成的实例配置快照 */
  config: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}
```

`revision` 属于后文的 `MaterialAggregate`，不在 Material 实体中重复保存。
不保留 `Material.data`。数据归属：

| 数据 | 归属 |
| --- | --- |
| 设备期望配置 | `material.config` |
| 试剂 | reagent 相关表 |
| 样品 | sample 相关表 |
| 容器与内容 | container/current-substance 相关表 |
| 空间与装配 | `relative_position`、`site` |
| status、pose、joints、传感器状态 | `material_state_history` |
| 选择、高亮、表单草稿 | 前端临时 store |

Cloud `node.data` 迁移时不能整体复制：

- 试剂、液体、样品和容器内容进入对应实体。
- status、pose、joints 和传感器值进入状态历史。
- 纯 UI 派生字段丢弃。
- 无法识别的字段进入迁移报告，不塞入 `metadata` 兜底。

### 5.2 Template 只是创建工厂

P1 不引入 Template Version。

规则：

- Template 创建 Material 时由后端展开。
- 创建完成后 Material 是独立实例，不再接收 Template 修改。
- Template 首次被使用后锁定，不允许原地修改或删除。
- 修改模板通过“复制为新模板”产生新 UUID。
- `sourceTemplateId` 只用于来源、兼容性和审计。
- P1 没有“升级已有 Material”操作。

这保留了 Cloud 的正确原则：前端创建时只提交模板 ID 和实例输入，由后端
生成完整 Material；但不复制 Cloud 的 `init_param_data` 大 JSON。

创建 Material 的数据库部分是后端原子操作：

```text
1. 校验并锁定 Template
2. 生成完整 Material.config
3. 创建默认 relative_position
4. 创建 Material 实例 Sites
5. 创建所需的模型/能力实例定义
6. 为需要 Edge provisioning 的 Material 创建 outbox operation
7. 提交数据库事务并返回完整 MaterialAggregate
```

后端不阻塞等待 Edge ACK。Edge 离线不应阻止 Cloud/本地用户继续进行 2D/3D
authoring。

Material 创建还必须记录实际产生的 Edge 副作用：

```ts
type EdgeProvisioning =
  | { kind: 'none' }
  | { kind: 'resource-tree' }
  | { kind: 'dynamic-device' };

type EdgeSyncState =
  | 'not-required'
  | 'pending'
  | 'synced'
  | 'failed';
```

- `none`：没有创建 Edge 实例；撤销只补偿后端。
- `resource-tree`：创建时向 OS resource tree add；撤销时 remove。
- `dynamic-device`：创建时确实动态启动设备；撤销时才调用
  `remove_device`。

已有物理设备默认只建立 Material/binding，不因撤销 Material 而关闭设备
驱动。后端必须持久化本次创建实际完成的 provisioning，`undoCreate` 根据
记录精确补偿，不能仅根据 Material/Template 类型推测。当前 OS 在线
`add_device` 尚未实现，因此 P1 不能产生 `dynamic-device` provisioning。

`EdgeSyncState` 是 Store 中不参与 zundo 的操作状态，不进入 Material authoring
数据。`pending` 或 `failed` 的 Material 可以继续参与 2D/3D 设计，但不能执行
需要真实 OS 的工作流动作。Edge 离线时 outbox 保留并重试，不自动删除
Material。

同一 Material 的 Edge operations 必须串行。`pending` 阶段立即执行
`undoCreate` 时：

```text
add 尚未发出
  → 取消 add outbox
  → 补偿删除后端 Aggregate

add 已发出
  → 确认 add 结果
  → 幂等执行 remove
  → 补偿删除后端 Aggregate
```

两种 Server 模式对前端提供相同链路：

```text
edge-server:
  Frontend ── HTTP + realtime WS ──> Uni-Lab-OS

backend-server:
  Frontend ── HTTP + realtime WS ──> Local Go / Cloud Backend
                                      ║
                                      ╚═ internal edge-control WS ═> Edge
```

前端只连接当前 Profile 的逻辑 Server。`backend-server` 通过内部双向
edge-control WS 下发 create provisioning 和 undoCreate 补偿，Edge 在同一
连接返回 operation ACK；数据库 outbox 负责断线补发和幂等重试。
`edge-server` 在本地执行同样语义，不需要额外 Backend relay，但仍需持久化
operation 状态以支持重试和恢复。

只有当前 Server 完成最终持久化后，才能通过其 realtime WS 向前端发布成功：

```text
edge-server:
  本地 add/remove → 本地持久化 committed → realtime event

backend-server:
  Backend 下发 operationId
  → Edge 完成并 ACK
  → Backend 持久化 synced/删除 Aggregate
  → Backend realtime event
```

```ts
interface MaterialEdgeOperationEvent {
  type: 'material.edge-operation';
  operationId: string;
  materialId: MaterialId;
  operation: 'provision' | 'undo-create';
  state: 'committed' | 'failed';
  error?: {
    code: string;
    message: string;
  };
}
```

Store 只接受当前 `operationId` 的事件。WS 断线后通过当前 Server 的 operation
状态校准恢复，不依赖错过的事件。

正常路径不轮询。Material Store 只在以下时机向当前 Server 做一次 operation
reconciliation：

- Material Graph 首次加载后。
- HTTP 命令返回 pending 后，避免事件早于 WS 订阅到达。
- realtime WS 重新连接成功后。

```ts
interface MaterialEdgeOperation {
  operationId: string;
  materialId: MaterialId;
  operation: 'provision' | 'undo-create';
  provisioning: EdgeProvisioning;
  state: 'pending' | 'edge-completed' | 'committed' | 'failed';
  error?: {
    code: string;
    message: string;
  };
}
```

reconciliation 只校准 operation 状态；不能重新加载整张 Material Graph、
清空 zundo 或改变普通 Material revision。

#### Realtime WS 鉴权

凭证由当前 Profile 指向的逻辑 Server 签发：

```ts
interface RealtimeSession {
  realtimeUrl: string;
  ticket: string;
  expiresAt: string;
}

interface RealtimeAuthMessage {
  type: 'auth';
  protocol: 'unilab/realtime-v1';
  ticket: string;
}
```

```text
1. Frontend 使用当前 Server 鉴权请求 RealtimeSession
2. Server 按 MaterialScope 签发短期一次性 ticket
3. Frontend 连接 RealtimeSession.realtimeUrl
4. WS 建立后的第一帧发送 RealtimeAuthMessage
5. Server 验证成功后才允许订阅和发送事件
```

Ticket 至少绑定用户/客户端、MaterialScope、Server ID、允许通道、过期时间和
一次性 nonce。Ticket 只保存在连接闭包内存，不进入 Zustand/localStorage；
重连必须重新签发。生产只允许 `wss://`，`ws://` 仅允许 loopback 开发环境，
Server 还需校验浏览器 Origin allowlist。本地无登录 Profile 也由 Edge Server
签发匿名短期 ticket。Backend OAuth token 不能转发到内部 Edge。

## 6. 静态坐标与装配模型

### 6.1 单位与坐标系

Material domain 的静态空间契约：

- 右手系。
- Z-up。
- 位置单位为 mm。
- 静态旋转存 XYZ Euler，单位为 degree。
- 计算时立即转换为 quaternion/matrix，不直接累加 Euler。

Pascal/Three 边界负责：

- Z-up → Y-up。
- mm → m。
- degree → rad/quaternion。

React Flow 边界负责：

- 物理平面 → 2D 画布。
- 物理原点 → 节点 origin。
- mm → view scale。
- 画布 Y 方向转换。

### 6.2 Placement

```ts
interface LabPose {
  positionMm: [number, number, number];
  rotationDegXYZ: [number, number, number];
}

type MaterialAnchor =
  | { kind: 'root' }
  | { kind: 'link'; linkName: string };

type MaterialPlacement =
  | {
      kind: 'unplaced';
    }
  | {
      kind: 'world';
      pose: LabPose;
    }
  | {
      /** 有 parent，但没有占用 Site */
      kind: 'parent';
      parentId: MaterialId;
      anchor: MaterialAnchor;
      localPose: LabPose;
    }
  | {
      /** 占用父 Material 的 Site */
      kind: 'site';
      parentId: MaterialId;
      siteId: string;
      offsetPose: LabPose;
    };
```

约束：

- child 不要求挂在 Site 上。
- `parent` placement 的 anchor 默认 `root`，进入 domain/store 前补全。
- `site` placement 的 `offsetPose` 默认 identity。
- parent 的 child IDs 由 placement 反向派生，不重复持久化。
- React Flow 的 `position`、`positionAbsolute`、`width`、`height` 等字段不进入
  Material domain。

### 6.3 Site

```ts
interface MaterialSite {
  id: string;
  ownerMaterialId: MaterialId;

  /** Material 实例内稳定语义 key */
  key: string;
  name: string;

  /** 默认 root；机械臂末端可指向 tool0 等 link */
  anchor: MaterialAnchor;

  /** 相对 anchor 的静态姿态，不是 world pose */
  poseInAnchor: LabPose;

  sizeMm: [number, number, number];
  capacity: number;
  allowedTemplateIds: readonly string[];

  /** 只在挂载/卸载时变化 */
  occupiedMaterialIds: readonly MaterialId[];
}
```

Site 表永远不保存高频 world pose。关节运动也不能更新 Site 表。
`occupiedMaterialIds.length` 不能超过 `capacity`；当前只允许单物料的 Site
使用 `capacity: 1`，不再通过可空单 ID 表达特殊情况。

前端 Site update 使用字段白名单：

```ts
interface UpdateMaterialSiteCommand {
  materialId: MaterialId;
  siteId: SiteId;
  expectedRevision: number;
  patch: {
    name?: string;
    anchor?: MaterialAnchor;
    poseInAnchor?: LabPose;
    sizeMm?: [number, number, number];
    capacity?: number;
    allowedTemplateIds?: readonly MaterialTemplateId[];
  };
}
```

`id`、`ownerMaterialId`、稳定语义 `key` 和 `occupiedMaterialIds` 永远不能由
该命令修改。后端还必须拒绝缺失 anchor link、`capacity` 小于当前占用数，
或新 allowed list 排除当前已挂载 Material 的更新。占用只允许通过
attach/detach/reparent 原子命令改变。

静态/动态求值：

```text
SiteLocal
  = Site.poseInAnchor

AnchorWorld(t)
  = ParentWorld(t) × AnchorTransform(t)

SiteWorld(t)
  = AnchorWorld(t) × SiteLocal

ChildWorld(t)
  = SiteWorld(t) × Child.offsetPose
```

直接 parent placement：

```text
ChildWorld(t)
  = ParentWorld(t) × AnchorTransform(t) × Child.localPose
```

### 6.4 follow-site

所有 Site 定义变化统一采用 follow-site：

- Site 静态位置或旋转变化。
- Site anchor 从 root 改为 link。
- Site link 变化。
- 机械臂关节使 link 在运行时移动。

这些情况下保持 child `offsetPose`，不提供 `preserve-world` 选项。

其他约束：

- 占用中的 Site 不能直接删除。
- 缺失 anchor link 时拒绝修改，不自动卸载。
- Site 修改只提升静态 Material revision，不写高频状态。
- 前端不提供 Site create/delete/restore。Site 由 Template 创建时在后端展开，
  或由后端管理工具维护；前端 `MaterialGraphPort` 只暴露 Site update。

显式“卸载”或“换挂”是另一类命令。它们保持执行瞬间的世界姿态：

```text
detach:
  newWorldPose = authoritative ChildWorld(t)

reattach:
  newOffset = inverse(TargetSiteWorld(t)) × ChildWorld(t)
```

这两个操作由后端基于最新权威运行时状态原子执行。移动 Site 的状态已 stale
时返回 `409 runtime_state_stale`，不能使用过期 pose 猜测。

## 7. React Flow 投影

React Flow 表达静态装配/authoring 状态，不表达机械臂当前运动。

```text
MaterialGraphStore
       │ pure projection selector
       ▼
React Flow Node[]
```

规则：

- domain `placement.parentId` 映射为 React Flow `parentId`。
- React Flow 使用 parent-relative position 承接平移层级。
- React Flow 不会传播相对旋转；旋转由投影 adapter 用 matrix 计算。
- 不复制 Cloud 的“累加祖先 Z Euler + 手工翻转”实现。
- 拖拽结束时通过逆矩阵把 view position 转回物理局部坐标。
- 任意 3D roll/pitch 只做平面投影；2D 画布不成为完整 6-DOF 真相。

有关节的模型使用静态参考构型：

```ts
interface ArticulatedTemplateInput {
  referenceJointStates?: Record<string, number>;
}
```

优先级：

```text
Template.referenceJointStates
  → URDF loader 提供的初始关节值
```

参考构型只在模板/模型加载时计算并缓存。它不进入
`material_state_history`，也不向真实机械臂发命令。

最重要的不变量：

- React Flow 不 import `scene-runtime`。
- React Flow 不订阅 joints、link pose 或 runtime world pose。
- 任意数量的关节更新都不能调用 React Flow `setNodes`。
- 关节更新不能改变 Material revision 或触发 Material selector。

## 8. Pascal 与上游边界

Pascal Editor 继续作为外部、固定版本依赖：

- `pascal-host` 负责加载上游 editor 和 Vite 兼容。
- `pascal-lab-plugin` 负责 Uni-Lab node、renderer、模型和坐标适配。
- 不 vendoring `pascalorg/editor`。
- 不把实验室业务提交进上游源码副本。
- 上游升级通过依赖版本、host 兼容和 plugin adapter 完成。

Pascal scene graph 是 Material 的会话投影：

```text
MaterialGraphStore
      │ application adapter
      ▼
Pascal scene graph
      │ edit result / command intent
      ▼
Material Store command action
```

对 moving Site，Three.js 层级应为：

```text
Parent URDF link
  └── SiteFrame (static Site.poseInAnchor)
      └── ChildRoot (static offsetPose)
          └── Child model / descendants
```

关节更新只改变 URDF link。Three.js 场景树自动传播到 Site、child 和后代，
不需要逐帧改 Material 或 Site。

Pascal store 只拥有：

- 相机和 viewport。
- scene object 选择。
- gizmo/工具会话。
- 尚未提交的 3D 编辑。
- 上游 editor 内部状态。

它不拥有 Material 业务实体，也不持久化第二份 Material graph。

`scene-runtime` 使用单个 Zustand vanilla Store 作为命令式 frame buffer：

```ts
interface KinematicsRuntime {
  ingest(message: PushJointStateMessage): void;
  get(materialId: MaterialId): RuntimeJointFrame | undefined;
  clear(materialId?: MaterialId): void;
  dispose(): void;
}
```

该 Store 不持久化、不进入 zundo，也不要求 JSON 序列化，因此内部可以使用
`Map`。realtime WS 每条消息只写一次；Pascal `useFrame` 通过
`kinematicsStore.getState()` 主动读取，不使用 React selector 订阅每个关节帧。
关节数值 UI 如需响应式显示，使用单独的低频 adapter。

## 9. 状态所有权

| 状态 | 所有者 | 形式 |
| --- | --- | --- |
| Material 聚合与编辑状态 | `packages/material` | Zustand vanilla store |
| Material undo/redo 历史 | `packages/material` | zundo temporal store |
| Edge provisioning 操作状态 | `packages/material` | 非 temporal 状态 |
| 非 Material Graph 的服务端查询缓存 | Services 消费方 | TanStack Query |
| 高频 joints/pose 热状态 | `packages/scene-runtime` | Zustand vanilla frame buffer |
| 手动 joint control lease | `packages/scene-runtime` | 非持久化 runtime 状态 |
| Pascal 编辑会话 | Pascal Editor | 上游 store |
| 跨 panel 选择/高亮 | kernel integration | Zustand vanilla store |
| panel layout | `panel-runtime` | reducer + storage port |
| 表单/hover/drag preview | 对应 feature | local/untracked state |

Material Store 是客户端编辑会话中的唯一 Material 业务真相。Material Graph
不进入 TanStack Query；Query 只缓存模板目录、模型资源和其他普通只读查询。
Services 只提供纯请求/订阅能力，不包含 Redux、Toast、Pascal 或 React Flow
状态。

Store 按 Material Aggregate 归一化：

```ts
interface MaterialStoreState {
  aggregatesById: Readonly<Record<MaterialId, MaterialAggregate>>;
  graphIndex: MaterialGraphIndex;

  edgeOperationsById: Readonly<
    Record<string, MaterialEdgeOperation>
  >;
  pendingCommandsById: Readonly<
    Record<string, PendingMaterialCommand>
  >;
  dragPreviewByMaterialId: Readonly<
    Record<MaterialId, LabPose>
  >;

  loadState: 'idle' | 'loading' | 'ready' | 'error';
  error?: MaterialStoreError;
}

interface MaterialGraphIndex {
  childrenByParentId: Readonly<
    Record<MaterialId, readonly MaterialId[]>
  >;
  siteOwnerById: Readonly<Record<SiteId, MaterialId>>;
}
```

- 使用 `Record`，不使用 `Map` 或递归 children tree。
- Site 内嵌在 owning Aggregate，不建立第二个 Site Store。
- `graphIndex` 只是不持久化、不进入 zundo 的可重建缓存。
- create/attach/detach/Site 结构变化后统一维护 index。
- React Flow nodes、Pascal scene、selection 和 runtime 不进入该状态。
- Realtime ticket、WebSocket 和 `AbortController` 保存在 Store factory
  闭包，不放入 Zustand state。

不建立独立 `MaterialSession` 或通用 Coordinator。`createMaterialStore` 注入
`MaterialGraphPort` 和 `MaterialScope`，Store 的异步 actions 负责加载、命令、
revision 冲突与清理。Profile 或 Scope 改变时，Provider 销毁旧 Store 并创建
新实例。React 组件只能调用 Store actions，不能直接调用
`services.materials`。P1 不负责把其他客户端的结构修改实时合入当前 Store。

跨 panel store 只传递：

- Material IDs。
- Scene object IDs。
- Workflow step ID。
- select/highlight/focus 等意图。

它不复制 Material、workflow document 或 Pascal scene。

## 10. 实时状态与记录

### 10.1 逻辑通道

关节、传感器和状态使用不同逻辑通道。它们可以复用一条物理 WebSocket：

```text
material.kinematics   # joints、link/material pose
material.sensor       # 温度、压力、测量值
material.status       # online、running、error
```

P1 的 kinematics 线协议与当前 Uni-Lab-Cloud 保持一致：

```ts
interface PushJointStateMessage {
  action: 'push_joint_state';
  data: {
    node_uuid: MaterialId;
    joint_states: Readonly<Record<string, number>>;
    resource_poses: Readonly<Record<string, string>>;
  };
}
```

`push_joint_state` 在前端路由到逻辑 `material.kinematics` 通道。
`joint_states` 使用 URDF/ROS 原生单位：revolute/continuous 为 rad，
prismatic 为 m。`resource_poses` 保持 Cloud 的
`Record<resourceId, linkName>` 形式，进入 runtime buffer，但 P1 不把它
解释或回写为 Material placement。

沿用 Cloud 的正确部分：

- 按 `node_uuid` latest-value-wins。
- Pascal 在 render frame 中把值传给 URDF `setJointValue`。
- joint 热数据不触碰 Material reducer。

不沿用 Cloud 的过渡实现：

- 不同时写 `useModel3DStore.liveJoints` 和 `useLiveJoints` 两份 Store。
- 不在 `save_graph` 前把 live joints 合并回 `node.pose`。
- 不从 Material `pose.joint_states` 恢复；无实时帧时使用已确认的 URDF 初始
  值 fallback。
- 不把仅改变 Pascal 本地值的滑块当成真实设备命令；在线 Profile 仍以设备
  反馈为权威。
- 不让 `LabDeviceRenderer` 通过 React selector 订阅每条 joints 消息。

Cloud 当前关节滑块只修改本地 Store，不会控制真实设备。P1 在统一 realtime
WS 上增加运行时命令：

```ts
interface SetJointStateMessage {
  action: 'set_joint_state';
  data: {
    command_id: string;
    node_uuid: MaterialId;
    joint_states: Readonly<Record<string, number>>;
  };
}
```

Material authoring 仍只通过当前 Server 的 HTTP API；`set_joint_state` 通过
当前 Server 的 realtime WS。RealtimeSession ticket 必须包含
`material.control` 权限。`edge-server` 直接校验和执行；
`backend-server` 对外鉴权并转发，实际 Edge 仍做最终 Material binding、
joint 名称、URDF limits 和设备状态校验。revolute/continuous 使用 rad，
prismatic 使用 m。

真实设备的手动控制必须先获得实际 Edge 签发的独占短期 lease：

```ts
interface AcquireJointControlMessage {
  action: 'acquire_joint_control';
  data: {
    request_id: string;
    node_uuid: MaterialId;
  };
}

interface JointControlLease {
  lease_id: string;
  node_uuid: MaterialId;
  expires_at: string;
}
```

`set_joint_state.data` 还必须携带 `lease_id`。统一 realtime contract 同时提供
`renew_joint_control` 和 `release_joint_control`：

```text
edge-server:
  Edge Server 本地创建并执行 lease

backend-server:
  Backend 鉴权
  → internal edge-control 请求实际 Edge
  → Edge 创建 lease
  → Backend 向前端返回结果
```

Edge 未确认时，Backend 不能宣称获取成功。同一 Material 同时只有一个手动
lease；工作流正在控制设备时拒绝手动 lease。WS 断线、客户端崩溃或续租停止
后，由 Edge 按本地 TTL 自动释放。lease 过期或 owner/ticket 不匹配的
`set_joint_state` 一律拒绝。紧急停止使用独立、更高优先级的安全通道，不依赖
普通 lease。

滑块可以写短暂本地 preview，但下一条 `push_joint_state` 必须立即覆盖；
不使用忽略 ROS 反馈的时间锁。拖动时命令频率由 Edge/设备策略限制，
pointer-up 必须发送最终值。command ACK/error 只表示命令接收或执行结果，
不能替代 `push_joint_state` 实际状态。命令与反馈可由 OS 录入 MCAP。

QoS：

| 通道 | 策略 |
| --- | --- |
| kinematics | latest-value-wins，渲染可丢弃中间帧 |
| sensor | 按业务要求批量、完整记录 |
| status | 低频可靠事件 |

在线真实后端下，后端/设备实际反馈是唯一权威状态。关节滑块只发送命令并可
短暂乐观预览；实际反馈到达后立即校正。只有离线模拟 Profile 可以让本地模拟器
成为状态来源。

### 10.2 material_state_history

`material_state_history` 保存低频上报和关键变化，不保存每个 ROS 原始帧。

它可包含：

- `state_kind`。
- `source`。
- `observed_at`。
- 低频 joint/pose/status/sensor snapshot。

精确 state schema 和 template schema 绑定不属于 P1 已确认范围。

### 10.3 OS 侧 MCAP

原始高频状态保留在 Uni-Lab-OS：

```text
ROS/设备原始状态
├── OS 内部原生频率
│   └── 按实验录制 rosbag2/MCAP
├── 低频 kinematics 上报
│   └── Pascal 插值显示
└── 更低频历史快照/关键变化
    └── material_state_history
```

OS 录制要求：

- 默认使用 MCAP。
- 由工作流/实验生命周期启动和停止。
- 使用 topic allowlist，不默认录制全部 topic。
- 至少覆盖 `/joint_states`、`/tf`、`/tf_static`、控制命令和关键设备反馈。
- 文件分卷，避免无限增长。
- 生成 experiment/workflow/material/topic/time/model 等 manifest。
- MCAP 作为实验 artifact 登记，不写入 Material 表或状态 JSON。

实时上报和 history 的精确默认 Hz 尚未最终确认，必须做成 Profile/设备策略，
不能硬编码在 React 组件中。

## 11. 后端聚合、命令与并发

### 11.1 Aggregate revision

Material、placement 和 owned Sites 构成一个 `MaterialAggregate`：

```ts
interface MaterialAggregate {
  material: Material;
  placement: MaterialPlacement;
  sites: readonly MaterialSite[];
  revision: number;
}
```

以下任意修改都提升 aggregate revision：

- Material config/名称等实例属性。
- placement。
- Site 定义。
- Site 占用。
- 挂载、卸载和换挂。

采用乐观并发：

```ts
interface MaterialCommandBase {
  materialId: string;
  expectedRevision: number;
}
```

revision 不匹配返回 `409 material_revision_conflict` 和服务器最新 aggregate。
不使用时间戳充当 revision，不静默覆盖。

### 11.2 多聚合原子命令

挂载涉及 parent 和 child：

```ts
interface AttachMaterialCommand {
  parentId: string;
  childId: string;
  siteId?: string;

  expectedParentRevision: number;
  expectedChildRevision: number;
}
```

后端事务必须：

```text
1. 检查两个 revision
2. 检查循环、Site capacity、兼容性和占用
3. 更新 parent Site
4. 更新 child placement
5. 同时提升 parent/child revision
6. 返回两个完整 aggregates
```

前端不通过多个原始 CRUD 请求拼装挂载、卸载或换挂。

### 11.3 MaterialGraphPort

目标 service port 保持纯净：

```ts
interface MaterialGraphPort {
  getGraph(scope: MaterialScope): Promise<MaterialAggregate[]>;
  createMaterial(
    scope: MaterialScope,
    input: CreateMaterialInput,
  ): Promise<CreateMaterialResult>;
  undoCreate(command: UndoCreateMaterialCommand): Promise<void>;
  updateConfig(command: UpdateMaterialConfigCommand): Promise<MaterialAggregate>;
  move(command: MoveMaterialCommand): Promise<MaterialAggregate>;
  attach(command: AttachMaterialCommand): Promise<MaterialMutationResult>;
  detach(command: DetachMaterialCommand): Promise<MaterialMutationResult>;
  updateSite(command: UpdateMaterialSiteCommand): Promise<MaterialAggregate>;
  getEdgeOperations(
    scope: MaterialScope,
    operationIds?: readonly string[],
  ): Promise<readonly MaterialEdgeOperation[]>;
}
```

它不包含 React hook、Toast、Redux、React Flow 或 Pascal 类型。具体 URL 仍可
在实现阶段调整，但语义和事务边界不能退回整图 `saveGraph`。该 port 在
`createMaterialStore` 时注入；Store 不根据后端类型选择具体实现。

P1 的 `MaterialGraphPort` 不提供结构事件订阅。多客户端同步以后单独设计，
不能提前加入未经确认的 cursor、JSON Patch 或事件日志协议。该限制不影响
`material.kinematics` 等高频运行时通道。

创建结果与受限撤销命令：

```ts
interface CreateMaterialResult {
  aggregate: MaterialAggregate;
  creationOperationId: string;
  edgeSyncState: EdgeSyncState;
}

interface UndoCreateMaterialCommand {
  materialId: MaterialId;
  creationOperationId: string;
  expectedRevision: number;
  idempotencyKey: string;
}
```

`undoCreate` 不是通用删除 API。后端必须校验 `creationOperationId`、当前
revision 和外部引用，前端不能用它删除任意 Material。

## 12. zundo 与持久化 Undo/Redo

允许使用 zundo，但只把它作为 Zustand temporal history engine。

跟踪：

- 可编辑 Material authoring state。
- 已提交的 config、placement 和 Site authoring 结果。

这里的 Site authoring 仅指允许的 update；前端没有 Site
create/delete/restore 历史节点。

zundo `partialize` 从 `aggregatesById` 生成不含 aggregate revision 的
`MaterialAuthoringSnapshot`。`graphIndex` 是从 snapshot 可重建的缓存，也不
进入 temporal history。

不跟踪：

- revision。
- pending/error/loading。
- selection/highlight/hover。
- drag preview。
- joints、runtime pose、sensor。
- Query cache 和 Pascal store。

拖拽过程中只更新未跟踪的 preview，pointer-up 时产生一个历史节点。

用户不能直接调用 zundo 原生 `undo()` 作为持久化撤销。统一使用 Material
Store actions：

```ts
interface MaterialUndoActions {
  undo(): Promise<void>;
  redo(): Promise<void>;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}
```

执行：

```text
1. 从 zundo 历史读取目标 authoring snapshot
2. 计算 current → target 的 domain command
3. 使用当前 expectedRevision 提交后端
4. 后端成功后移动 zundo history 指针
5. 用后端返回 aggregate 校准 Material Store
```

`409` 时不移动 history 指针。P1 获取服务器最新 aggregate、提示冲突并清空
当前场景 undo/redo，不能本地假装撤销成功。

Profile、laboratory scope 或 graph 切换时清空 zundo history。

### 12.1 创建的撤销

Material 创建进入 zundo 历史，但它的逆操作不是本地删除，而是
`MaterialGraphPort.undoCreate`：

```text
Material Store undo
  → 当前 Profile Server
  → 根据 create 记录在本地或内部 Edge 补偿
      ├─ none: 无 Edge 删除
      ├─ resource-tree: resource tree remove
      └─ dynamic-device: remove_device
  → 等待 Server committed
  → Server 删除 Material、placement 和 owned Sites
  → 前端移除 aggregate
  → 最后移动 zundo 指针
```

规则：

- 前端只请求当前 Profile 的逻辑 Server。
- Server 负责 Material 到 Edge runtime/resource 的 binding，并保存 create
  实际产生的 provisioning；backend-server 才使用内部 edge-control WS。
- Undo 只能逆转 create 记录的副作用；已有设备 binding 的撤销不能关闭驱动。
- Edge 删除以 `idempotencyKey` 幂等；目标不存在也视为成功。
- 同一 Material 的 Edge add/remove 按 operation 顺序串行执行。
- backend-server→Edge 的操作只通过内部双向 control WS 直接推送；outbox
  负责断线可靠性。
- 当前 Server 未 committed 时不能向前端广播成功。
- Server 未确认完成时，服务端和前端都不删除，zundo 指针不移动。
- 同一补偿可以安全重试。
- Server 使用持久化 compensation operation；backend-server 的 outbox 至少区分
  `pending_edge_delete`、`edge_acknowledged`、`backend_deleted`。
- 不在等待 Edge 网络响应期间持有数据库事务。
- 普通 Material 删除、归档和恢复仍不属于 P1。

## 13. Panel 与跨 package 交互

跨 panel 调用使用 interaction store 与应用命令 adapter：

```text
Workflow step selects materials
  → interactionStore.selectMaterials(ids)
  → React Flow/Pascal 分别高亮

Pascal commits a move
  → Material Store action
  → injected MaterialGraphPort
  → Material Store
  → React Flow/Pascal projections refresh
```

禁止：

- panel 通过 React ref 互调。
- DOM CustomEvent 作为业务命令总线。
- Pascal 直接调用后端。
- React Flow 直接更新 Pascal store。
- workflow editor 持有 Material 实体副本。

## 14. 测试要求

### 14.1 Domain

- parent/root/link/site matrix composition。
- Site follow-site 与 offset 保持。
- parent cycle 检查。
- attach/detach/reparent inverse transform。
- Z-up/mm/degree 与 Pascal Y-up/m/rad 转换。
- React Flow plane projection 与拖拽逆变换。

### 14.2 Store

- Material Store 是唯一实体副本。
- capability 不进入 Material Store；Store action 通过注入的 Services 做防御
  检查并统一返回 `UnsupportedCapabilityError`。
- Store 使用 `Record<MaterialId, MaterialAggregate>`，Site 不拆分为第二个
  Store。
- graph index 可由 aggregates 完整重建，重建结果与增量维护结果一致。
- drag preview 不进入 zundo。
- 一次 drag 只产生一个 undo 节点。
- create undo 必须等待 Edge ACK 和后端删除后才能移动历史指针。
- create undo 重试保持幂等，Edge 已不存在时仍能完成后端补偿。
- `none/resource-tree/dynamic-device` 分别执行对称补偿。
- 已有设备的 Material undo 不调用 `remove_device`。
- Edge pending/failed 状态不进入 zundo。
- pending add 与 undo remove 不会乱序，未发出的 add 可直接取消。
- backend-server 的 edge-control WS 断线时 operation 留在 outbox，重连后
  通过 WS 幂等补发。
- Edge 未同步的 Material 不能执行真实 OS 工作流动作。
- 当前 Server 未 committed 时，Store 不更新最终状态。
- 初次加载、HTTP pending 和 realtime WS 重连时各做一次当前 Server operation
  reconciliation。
- reconciliation 不轮询、不重载 Material Graph、不清空 zundo。
- Realtime ticket 不持久化，重连重新签发；未鉴权连接不能收到业务事件。
- 生产拒绝非 WSS 和非 allowlist Origin，开发用 WS 仅允许 loopback。
- runtime 更新不改变 Material revision。
- 10,000 次 joint frame 不通知 Material/React Flow selector。
- 10,000 次 joint frame 不触发 `LabDeviceRenderer` React render。
- 每条 `push_joint_state` 只写一个 scene-runtime vanilla Store。
- `push_joint_state` 的 revolute rad、prismatic m 值能直接驱动 URDF。
- `resource_poses` 不回写 Material placement 或 Site。
- 未授权 ticket 不能发送 `set_joint_state`。
- 实际 Edge 拒绝未知 joint、越界值、错误 Material binding 和不允许控制的
  设备状态。
- 没有实际 Edge lease、lease 过期或 owner 不匹配时拒绝 joint command。
- backend-server 只有收到 Edge lease ACK 后才能向前端返回 acquire 成功。
- WS 断开或客户端崩溃后 lease 按 Edge 本地 TTL 自动释放。
- workflow control 优先于手动 lease，emergency stop 不依赖普通 lease。
- command ACK 不改变实际 joint frame，只有 `push_joint_state` 覆盖 preview。
- Profile/scope 切换清空 runtime、pending 和 undo。

### 14.3 Backend contract

- `singleton` 不发送 laboratoryId。
- 当前 adapter 的 capability matrix 与其真实接口一致，不以 404 作为能力探测。
- 不可用功能同时覆盖 UI 禁用和 Store action 拒绝测试。
- edge-server/backend-server 对前端实现同一 HTTP、realtime、ticket 和
  operation reconciliation contract。
- Material 创建原子展开 Template。
- 被使用 Template 锁定。
- 前端契约不暴露 Site create/delete/restore。
- Site update 只接受白名单字段，身份与 occupancy 字段不可写。
- Material API 不再读写 `data`。
- aggregate revision 冲突返回 409。
- attach/detach/reparent 是事务。
- `undoCreate` 只能补偿匹配的 `creationOperationId`，不能充当通用删除。
- moving Site stale 时拒绝 detach/reparent。
- occupied Site 不能删除。

### 14.4 Pascal integration

- root/link/SiteFrame 挂载。
- URDF 初始关节值作为 reference fallback。
- live joints 只更新 scene runtime/URDF。
- 上游 Pascal 升级适配测试。
- 场景卸载时释放模型、订阅和 GPU 资源。

### 14.5 OS recording

- 工作流开始/结束驱动 MCAP 生命周期。
- 异常、取消和重启时可靠关闭或恢复录制。
- topic allowlist。
- 分卷和 manifest。
- 低频上报不因 MCAP 开关改变。

## 15. Cloud 数据迁移

既有 Uni-Lab-Cloud 数据通过一次性离线 importer 迁移，不在前端或运行时
Services 中保留旧协议 adapter，也不做长期双写。

```text
Uni-Lab-Cloud export
  → dry-run / validate / transform
  → 新 Backend 专用 import API/CLI
  → migration report + ID map
```

规则：

- 优先保留 Template、Material 和 Site UUID。
- 只有 UUID 冲突时生成新 UUID，并记录完整 ID map。
- 已存在 Material 不调用普通 `createMaterial`，避免重复展开 Template Sites。
- 专用 import transaction 一次写入完整 Material Aggregate，失败不留下半个
  Aggregate。
- Cloud `node.data` 按第 5.1 节的业务归属转换，未知字段只进入报告。
- importer 支持 `--dry-run`、checkpoint、幂等重跑，以及逐条
  `imported/skipped/failed` 结果。
- Cloud workflow canvas 不迁移；保留 Material UUID 以维持新工作流中可能存在
  的 Material 引用。
- 迁移完成后前端只访问新协议。

导入顺序：

```text
Templates
→ Materials
→ Sites
→ Placements
→ reagent/sample/container
→ selected state history
→ relationship validation
```

## 16. 当前实现差距

### uni-lab-fe

- `packages/material` 已有唯一 Material Graph Store、domain/rules/geometry、
  React Flow 投影、drag preview、revision actions 与 zundo authoring history。
- `apps/kernel-web` 已按 Profile/scope 注入 Material service，2D 与 Pascal 3D
  订阅同一个 Store；跨 panel store 只保存 material/scene/workflow ID。
- `packages/scene-runtime` 尚未创建。
- `packages/services/src/materials.ts` 已移除旧 Cloud laboratory API 和整图
  保存，只接入 Local Go 的新 ResourceTemplate 列表/详情接口；Material Graph
  port 已定义并按 capability 防御，但各 Server adapter 尚未实现目标命令。
- `BackendConfig` 已包含 `serverKind` 和 `workspaceMode`；非 Cloud 默认
  singleton，Cloud laboratory scope 未选择时不制造 laboratory ID。
- `Services` 已有 deny-by-default capability matrix、禁用原因和
  `UnsupportedCapabilityError`；当前只打开 Local Go
  `material.readTemplates`，其余目标能力关闭。
- Material/Scene UI 与 Store action 已消费同一个 capability key；能力关闭时
  展示原因且不发 transport 请求。
- zundo 已作为 `packages/material` 直接依赖接入，但 persistent undo 仍等待
  Server contract。
- Pascal plugin 已使用 Aggregate projection、上游 `setScene`、root/link frame
  和共享选择状态；live joint path 仍未迁入。
- 旧示例图、scene localStorage、Cloud-shaped Pascal DTO 和本地 Material
  JSON/YAML 编辑器已删除。

### uni-lab-backend

- `Material` 仍有 `Data`。
- Material/Site/RelativePosition 没有 aggregate revision。
- 创建接口没有持久化 `creationOperationId`，也没有 Edge 补偿 outbox。
- Material 创建没有持久化本次实际 Edge provisioning 类型。
- Material 创建尚无异步 `EdgeSyncState` 和 per-Material operation ordering。
- 后端没有按 scope/operation IDs 查询补偿操作状态的 reconciliation API。
- Go/Cloud Backend 没有按 scope 签发短期一次性 RealtimeSession ticket 的
  统一接口。
- Material 创建不会展开 Template Sites。
- Site 缺少 stable key、anchor、rotation 和 capacity。
- RelativePosition 尚未表达 world/parent/site reference。
- attach/detach/reparent 尚无原子命令 API。
- `material_state_history` 只有 REST history/latest，高频运行时订阅仍待接入；
  Material Graph 的多客户端结构订阅不属于 P1。

### Uni-Lab-OS

- 已有 ROS joint state，但没有 rosbag2/MCAP recording manager。
- 已有 resource tree remove 和 device remove 路径，但缺少用于
  `undoCreate` 的持久化操作 ID、幂等 ACK 与可靠重试契约。
- 在线 `add_device` 当前未实现，P1 不能宣称支持 `dynamic-device` 创建。
- Uni-Lab-OS 尚未完整实现与 Backend 相同的 `unilab/v1` HTTP 和
  `unilab/realtime-v1` 公开 Server contract。
- 现有 Edge→Backend WS 尚未形成带 operationId、ACK 和 outbox 重放的双向
  Material control channel。
- Edge Server realtime WS 尚无 `unilab/realtime-v1` 首帧鉴权、ticket、
  Origin allowlist 和生产 WSS 约束。
- Cloud 关节滑块当前只改本地 Store；Edge Server 和 Backend Server 均尚无
  统一的 `set_joint_state` 对外协议，实际 Edge 也缺少完整权限、限位校验和
  ACK 契约。
- 实际 Edge 尚无统一的 acquire/renew/release joint control lease 与 TTL
  强制机制。
- 高频 joint、低频 kinematics、sensor 和 status 尚未形成统一逻辑 topic 契约。

## 17. 实施顺序

### 17.1 本轮 `uni-lab-fe`

1. 演进 Backend Profile 和 Services port，使 feature package 面向统一逻辑
   Server contract，同时不引入旧 Cloud adapter。
2. 建立 `packages/material` types/geometry/rules、Zustand vanilla store 和
   zundo temporal 基础；依赖 revision/原子命令的持久化能力在服务端可用前
   不对用户宣称可用。
3. 用 Material Store projection 接入物料 React Flow，保持 `uni-lab-fe`
   design system/theme。
4. 建立 `packages/scene-runtime`，按 Cloud 现有 `push_joint_state` 接入单一
   Zustand vanilla frame buffer。
5. 把 Pascal 示例图替换为 Material Store projection，迁入 live joint path。
6. 完成 domain、store、projection、performance 和 Electron/Web 一致性测试。

### 17.2 未来外部前置工作

以下工作不在本轮修改范围：

1. 修改 Go backend domain/schema：
   - 删除 Material data。
   - 增加 Material aggregate revision。
   - 补齐 Site/Placement。
   - 增加原子 create/undoCreate/attach/detach/reparent 命令和 Edge 补偿
     outbox。
2. 在 Uni-Lab-OS 增加统一 Server contract、幂等 undoCreate 删除 ACK、
   joint control lease、低频上报与 MCAP
   recording manager。
3. 为 Edge Server 和 Backend Server 增加统一 contract/conformance tests。

## 18. 尚未决

以下内容没有在本文中伪装成已确认决策：

- 实时 kinematics 和 history 的具体默认 Hz。
- `material_state_history.state_data` 的设备级 schema/version。
- MCAP artifact 上传、远端存储和长期保留策略。
- Material Graph 多客户端/多窗口结构同步（明确不属于 P1，未来单独设计）。
- 通用 Material 删除/归档生命周期（明确不属于 P1；只实现受限的
  `undoCreate` 补偿）。
- config/placement/attach/detach/Site update 等一般静态修改到 Edge 的同步，
  以及届时采用完整 snapshot 还是 patch 的载荷协议。
- Pascal 轨迹、末端拖拽和 2D floorplan 的完整交互。
- 未来是否引入真正的 Template Version/Upgrade。
- 最终 REST/WS 路由名称。
