# M2B MaterialSource 前端节点设计

日期：2026-08-02

状态：**IMPLEMENTED / NATIVE CLI + BROWSER E2E ACCEPTED**。
本文同步 OS M2B 的 MaterialSource admission 合同；前端实现保留在独立 FE worktree/branch，
没有把前端提交混入 OS M2B round。

FE 基线：
`integration/fe-os-migration@0bf83ea93de9aff5a10f0419a3322cff27b48595`

OS 验收基线：
`migration/m2b-material-source-admission@dca2335c8cb3ddbc10117f27906a8fa2522326cd`
（MaterialSource 行为实现截至 `2636f128d20db306c56ac4c661038c0e7ed61777`，随后提交只补充
验收记录）中的
`docs/developer_guide/workflow_task_runtime_migration/rounds/m2b-material-source-admission-design.md`。

## 1. Job 与用户

实验工作流作者需要在同一个持久 Authoring 工作台里声明“这个 WorkflowTask 需要哪一种
Material、从哪个 mount/Site 范围取得，以及找已有实例还是新建实例”。用户必须能在 Apply 前
看懂 selector，在运行后区分“尚未执行 Action”与“正在等待 Task-wide Material admission”。

MaterialSource 是 **非 Action 的持久 selector 节点**，不是设备 Action、控制节点或前端本地物料。
它在 Authoring/Compile 阶段保存 closed selector，在 Task-time 对应 coordinator-owned resolution Job。
OS 继续拥有静态校验、Task snapshot、Task-wide assignment、Reservation 和运行状态；前端只编辑
Candidate、显示 OS diagnostics，并投影权威 Task/Job 状态。

## 2. LINQ 参考的结构提炼

本设计重度参考用户提供的 LINQ workflow builder，但只吸收适合 Uni-Lab 合同的交互结构，
不复制品牌、字段或运行语义。参考图最有价值的不是白色画布，而是以下关系：

- Material 先以独立 source token 进入画布，随后成为贯穿多个 Task 的连续有色轨道；
- Action 卡保持紧凑，卡内只显示它消费/产出的 Material chips 与真实端口；
- 多 Material Action 通过并列 chips 和各自的连线颜色形成可扫视的 fan-in/fan-out；
- 复杂字段不塞进节点卡，选中对象后统一在右侧 Properties inspector 编辑；
- 左侧 palette 负责“添加什么”，中间 canvas 负责“怎么流动”，右侧 inspector 负责“具体是什么”。

Uni-Lab 对应采用同一拓扑，但继续服从 Canonical Graph、真实 Handle UUID 和现有单编辑权：

```text
左：Action / MaterialSource palette
                │
中：Material tracks + compact Action cards
                │ selected stable node UUID
右：MaterialSource Properties inspector
```

Canvas 模式让 DAG 成为主工作区：左侧使用窄、可收起 palette，右侧使用固定宽度 inspector；
Python 仍是同一个持久 Authoring 文档，在 Code 模式保持主编辑面，在 Canvas 模式作为可展开的只读
source/diff 区域，不创建第二个 Workflow 文档或第二张画布。

## 3. Material track 与节点形态

MaterialSource 不复用普通矩形 Action card，而使用紧凑的 source token：plate/material glyph、稳定名称、
mount 摘要和一个底部 typed ResourceSlot source port。轮廓可采用参考图的六边形仪器标记，但必须保持
可访问 hit target，不能让形状成为唯一类型证据。token 明文标记“物料来源”，且不提供起始点或断点。

每个 MaterialSource 按稳定 Node UUID 取得一个确定性的 **trace accent**。同一 ResourceSlot 经真实
Handle Edge 和 implicit pass-through 流经后续 Action 时，连线、端口环和 chip 使用相同 accent；Action
卡本体保持中性，运行状态仍由独立文字 badge/边框表达。trace accent 是对象追踪色，不是状态色：

- 不用 success green、warning amber、danger red 表示 Material identity；
- 颜色必须同时由 Material name/chip label、端口 title/aria 和选中高亮佐证；
- 调色板碰撞时增加稳定短标识或线型，不依赖用户辨色；
- runtime success/running/failed 不重染整条 Material track，避免把 identity 误读成状态。

Action 卡借鉴 LINQ 的紧凑端口条：标题/执行器仍在卡外或卡头，卡内按真实 target/source Handle 顺序
展示 Material chips。一个 Action 同时消费 assay、standards、tip rack 时，三个 chip 与三条轨道并列，
而不是把完整 Material 表单复制三遍。所有连线仍由 Graph 中的真实 source/target Handle UUID 驱动；
前端不得因视觉上同色或同名自行合并 ResourceSlot。

source token 在一次扫视中应回答：

```text
      [plate glyph]
assay_plate
主样品 · 已有物料
Mount A
      ● material
```

右侧 inspector 再回答 template、mode、fixed Material 和 Site 范围等完整事实。

## 4. Properties inspector

节点属性使用 LINQ 式右侧 Properties inspector，不复用 typed Action 参数表单，也不把 UUID JSON 输入框
作为默认交互。顶部身份区显示 material glyph、节点名称、flow role chip、trace accent 和当前权威状态；
字段分为“物料”“来源”“库位范围”三组：

1. **物料角色**：主样品、分装样品、试剂、耗材；wire value 分别为
   `primary_sample | aliquot_sample | reagent | consumable`。
2. **取得方式**：`existing | create_new`。使用两个互斥的紧凑分段选项；
   `create_new` 时不显示或提交 fixed Material。
3. **ResourceTemplate**：从当前 Graph Authority/Material Authority 的权威只读目录选择，保存稳定
   `resource_template_uuid`，label 只用于显示。
4. **Mount**：从当前 Material Aggregate 投影选择一个稳定 Material UUID，保存
   `mount={uuid}`；不得输入 flatten tree 或复制 Material 实体到 Workflow store。
5. **Site 范围**：三种互斥表达：
   - 全部兼容 direct Sites：`site=null, slot_range=null`；
   - 固定 Site：保存 `site=<uuid>`；
   - 候选 Site 集：保存非空 `slot_range=[uuid...]`。
6. **Fixed Material**：仅 `existing` 可选；空值表示运行时自动选择，非空保存稳定
   `material_uuid`。

参考图的 Labware、Name、Start Location、Slot 分别映射为 Uni-Lab 的 ResourceTemplate、Node name、
Mount、Site scope。Content、Closure State、Comments 不在 M2A/M2B selector 合同中，因此不照搬，
也不藏进 `meta_data`。Properties inspector 底部只显示 OS Preview/Apply diagnostics 和 source diff
状态，不制造未受权威支持的业务字段。

Site 选项在 UI 中按 `Site.sort_order ASC, Site.uuid ASC` 展示。`slot_range` 写入 Canonical
Graph/Python 时仍按 UUID 规范排序，因为输入数组不是业务优先级；界面不提供拖拽排序，也不暗示
第一个候选会优先。固定 Material 当前不在所选范围内时，Preview/Apply 展示 OS
`material_source_conflict`；Task-time 位置不匹配由 M2B 最终 reject，界面不得承诺等待搬入。

## 5. Authoring 数据边界

MaterialSource 节点继续沿用现有单编辑权：

```text
Material/Site authoritative read projection
                │ stable UUID + display facts only
                ▼
PersistentWorkflowAuthoringPanel MaterialSource editor
                │ mutate Candidate Graph buffer
                ▼
OS generate-python → complete source diff acceptance
                ▼
Draft PUT → Candidate → Validate → Apply
```

- `packages/workflow-editor` 定义 closed selector projection/mutation 函数；组件不直接 `fetch`；
- `packages/services` 负责 Graph Authority catalog adapter，不按 profile id 在组件中分支；
- `packages/material` 仍是 Material Aggregate 的唯一前端 owner；Workflow Editor 只消费只读选择事实，
  不建立第二个 Material store；
- app composition 只传稳定 UUID、label、sort order、template compatibility 和 selection intent；
- 现有 `WorkflowActionCatalogSnapshot` 继续只含 typed Actions。MaterialSource framework template
  使用独立的 closed projection，不能把 framework 节点伪装成 Action；
- ReactFlow nodes/edges 仍只是 Candidate/Applied Graph 的视图，不能成为保存或执行载荷。

## 6. 运行状态

FE 必须先接受新的 `WorkflowTask.status=admission_blocked`，显示“等待物料准入”。该状态下：

- `cancel` 保持可用；
- `pause`、`resume`、`step` 禁用；
- MaterialSource resolution Jobs 保持 pending，节点显示“等待物料”；
- 普通 Action 节点仍显示“等待执行”，不得伪造 running/success；
- 重新收到 `workflow.runtime.changed` 后沿既有 REST rehydrate 更新 Task/Jobs；
- 基础 M2B 没有前端专用 blocked diagnostic read model，UI 只陈述权威等待状态，不猜测缺料、占用或
  Site 冲突。详细可行动原因留给 M2D。

resolution Job `succeeded` 后，节点显示“物料已绑定”；`failed` 时显示“物料解析失败”并展示 OS
返回的稳定 diagnostic。MaterialSource 成功不是设备执行成功，不使用“执行成功”文案。

## 7. 状态与边界情况

- Loading：保留已应用节点投影，属性面板显示目录/Material facts 正在补读，不清空 selector；
- Empty：没有 compatible direct Site 时允许保留表单，但 Preview/Apply 必须显示 OS diagnostic；
- Stale：目录 fingerprint 或 Material facts stale 时禁用 Apply/选择变更并要求刷新，不自动重绑定；
- Deleted/missing：稳定 UUID 保留在 dirty buffer，并显示“引用已失效”，不能静默选择另一对象；
- Overflow：Site 候选支持搜索和多选摘要，不把大量 UUID 全铺在节点卡上；
- Keyboard：所有字段、模式切换、候选选择、诊断跳转可键盘完成并有可见焦点；
- Responsive：桌面优先保持 palette / canvas / inspector 三段关系；中等宽度先收起 palette，窄屏把
  inspector 变为底部 sheet。DAG 节点保持最小可读宽度，不水平压缩 UUID/状态文本。

## 8. 分轮交付

### FE-M2B0：运行兼容与节点语义

- `WorkflowTaskStatus`、控制禁用规则和中文状态支持 `admission_blocked`；
- DAG 将 `material_source` 投影为 source token，使用专用状态文案；
- MaterialSource 隐藏起始点/断点入口；
- deterministic trace accent 与 Action material chips 只消费真实 Handle Edge；
- unit/component tests 覆盖状态、文案、键盘/aria、颜色非唯一表达和非 Action 语义。

### FE-M2B1：Selector authoring

- 独立 framework template projection；
- closed selector projection/mutation；
- Material/Template/Mount/Site 只读选择 port；
- LINQ 式右侧 Properties inspector 与左侧独立 MaterialSource palette entry；
- Site-order 展示、UUID-order canonical persistence；
- generate-python、Validate、Apply、reload fixed point；
- 真实 OS browser E2E 覆盖 existing/fixed/automatic/create_new、Candidate Site 搜索/多选、
  `admission_blocked`/取消与 static reject。

## 9. Anti-goals

- 不在前端实现 Task-wide assignment、Site allocation、Reservation 或 Inventory deduction；
- 不让 CandidateSiteSet 的交互顺序成为运行优先级；
- 不自动移动 fixed Material，不为 location mismatch 提供“等待搬入”状态；
- 不新增 MaterialSource Action template、第二 Workflow canvas、第二 Material store 或前端 DAG walker；
- 不照搬 LINQ 的 Content、Closure State、Comments 或 labware-specific 私有字段；
- 不用 Material track accent 冒充 success/running/failed，不按颜色合并 Material identity；
- 不从 name、label、handle ordinal、PLR resource name 或 display order 猜稳定 identity；
- 不在基础 FE-M2B0/M2B1 实现 M2D 的专用 Task Material/Site diagnostics surface。

## 10. 验收 seam

前端测试只验证两个公共 seam：

1. closed Candidate Graph 输入经过 MaterialSource projection/mutation 后，送入现有
   generate-python/Validate/Apply 流程可保持 selector 与稳定 identity；
2. `WorkflowRuntimePort` 返回 Task/Jobs 后，节点卡和 Task 控制准确投影
   `admission_blocked → pending/running` 或 `failed/canceled`，不产生本地虚构状态。

真实浏览器验收必须连接 OS v1 接口，不使用 route mock 证明端到端成功。

## 11. 实现与验收记录

实现落在 FE branch `migration/m2b-material-source-node`，继续以
`integration/fe-os-migration@0bf83ea93de9aff5a10f0419a3322cff27b48595` 为 merge-base。
公共 seam 与第 10 节一致：services adapter 读取 framework template、Material 与 Site 事实；
workflow-editor 维护 closed selector 和 Material trace；运行控制只通过 `WorkflowRuntimePort`。
MaterialSource 只通过权威 ResourceSlot Handle 连接 typed Action target，并在前端即时执行
`fan-out <= 1`。Catalog fingerprint 冲突时同时刷新 Action 与 MaterialSource authority；rehydrate
只更新 typed Action wire，原样保留 MaterialSource framework node/template/handle/edge 与 dirty buffer。

真实 E2E 使用 OS 原生可执行文件
`/home/changjunhan/.micromamba/envs/unilab/bin/unilab`，`PYTHONPATH` 指向上述 OS 验收基线，
以 `ros + fastapi + edge_scheduler` 启动。浏览器连接生产构建，不注册 route mock，并从前端依次完成
palette 添加/放弃、closed selector 编辑（含 Candidate Site 搜索/多选）、完整 canonical Python diff
接受、Apply 和 Start：

```bash
pnpm build:web
UNILAB_FE_E2E_URL=http://127.0.0.1:4173 \
  pnpm exec playwright test \
  e2e/workflow-material-source-native-cli-real-os.spec.ts
```

2026-08-02 最终运行结果为 `1 passed`。运行前 Inventory 含 1 个 mount Material、空 Site、无
Reservation；运行后生成 1 个新 Material，目标 Site 记录该 Material，占用成员进入 active
Reservation。Inventory snapshot sequence 从 1 增至 4；ledger 按同一 causation id 记录：

1. `material.created`；
2. `site.occupancy_updated`；
3. `material_reservation.admitted`。

`inventory_lots` 前后均为空，明确证明 Inventory deduction 仍是 non-goal。浏览器同时验证
MaterialSource Job `succeeded`、节点显示“物料已绑定”、Task POST 返回 201，且没有浏览器 WebSocket、
console error、page error 或原生 traceback。对同一已占用 Site 再次 Start 后，Task 权威状态进入
`admission_blocked`，MaterialSource Job 保持 `pending` 且无伪造 diagnostic；前端显示“等待物料准入”，
禁用 pause/resume/step、保留 cancel，并通过 UI 取消。取消会按 OS 语义释放既有 Reservation。

随后浏览器把已创建 Material 固定到另一个 Site；M2A current-fact 校验在保存阶段以
`material_source_conflict` 拒绝，不产生 Draft/Task 或额外 Inventory 变更。若位置事实在 Apply 后漂移，
Task-time reject 仍由 OS M2B 权威处理，前端不虚构“等待搬入”。证据输出到相邻 worktree 的
`e2e-artifacts/m2b-material-source-native-cli/`，包括九张设计截图、Inventory before/after/reject、
ledger、outbox、成功/阻塞 Job 与 Task、静态拒绝记录、network ledger、CLI stdout 与原生 OS 日志。

纯 MaterialSource fixture 中 resolution Job 成功后，Task 仍可保持 `pending`；这是当前 OS 对无 Action
工作流的权威状态，不由前端补写完成态。它不影响本轮“可从前端启动并发生真实 Inventory admission”
的验收目标。

## 12. Finish verdict / DESIGN.md

结论：M2B MaterialSource 前端节点已按本文设计实现，Native CLI + browser E2E 接受，可以执行。
本轮没有产生跨功能复用的新视觉 token 或组件规则，因此根 `DESIGN.md` 不改；功能特有的 LINQ
映射、Material identity/state 分离与响应式 Properties 规则继续由本文维护。
