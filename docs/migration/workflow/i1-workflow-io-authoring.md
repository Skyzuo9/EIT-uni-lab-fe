# I1 Workflow I/O authoring and Task form implementation spec

<!-- current-i1-fe-round:2026-08-02-applied-task-input-form-e2e-green -->
> [!IMPORTANT]
> 本块是本文唯一 current 实现状态；下文早期 baseline、分支名与 RED 启动记录保留为
> provenance，但由本块 supersede。
>
> Candidate editor 已以 non-squash merge 集成到
> `integration/fe-os-migration@0bf83ea93de9aff5a10f0419a3322cff27b48595`。本轮从该精确
> 基线建立 `migration/i1-applied-task-input-form`，在原
> `PersistentWorkflowAuthoringPanel` 中加入 Applied-contract Task 启动表单；没有建立第二
> 工作台、第二 store 或浏览器 schema authority。
>
> 普通 Run 现在只从最新 Applied aggregate 投影输入表单；Candidate 即使存在也不会进入 Task
> payload。表单保留 omitted / explicit null / explicit value 三态，提交前重新读取 Applied
> revision，创建后核对 Task snapshot revision。真实 OS 标量输入/default browser gate 已通过，
> 完整 Authoring suite 为 `7 passed`。ResourceSlot control 与完整 Core #157 gate 仍是下一
> round；整个 I1 继续保持 implementation，不提前实现 O1。

## Applied Task input form round ledger（2026-08-02）

本轮沿用 I1 唯一独立 test-author `/root/i1_fe_io_editor_red`。实现基线为 FE integration
`0bf83ea93de9aff5a10f0419a3322cff27b48595`，tests-only 原始提交与实现分支 cherry-pick 如下：

| 行为 | tests-only 原始提交 | 实现分支提交 |
|---|---|---|
| Applied-only form projection、三态 codec 与 Task payload RED | `fa530496478b17653d30a0e04b8afa1b167bfec2` | `f7df68eccc874e00bf9526bdb55a8269c6a093d1` |
| 真实 OS scalar input/default browser RED | `21899bcea70b715d11badcff360fa374215cd6c5` | `6cc9b676fe91cf0aa91925661db2fb30ce3df4b8` |

首轮测试在 production 实现前为 `7 failed / 12 passed`；第二轮真实 OS 夹具已成功 compile、Apply，
并在旧 production 点击 Run 后因不存在输入表单而得到预期 RED。生产提交
`8891fa0ac2f98cb47b42a53aae573c712a172a57` 完成以下合同：

- `WorkflowTaskController.create(runMode, input?)` 只转发共享 Task 字段和用户明确 input；
- Run 打开表单前读取 Applied graph，提交前再次 rehydrate；revision/contract 变化时重投影并要求
  用户重新确认，Task 创建后再核对 snapshot revision；
- required omission 被本地即时拒绝；optional untouched 保持 omission，让 OS 应用 authoritative
  default；`""`、`0`、`false`、`[]`、`{}` 与显式 `null` 均原样提交；
- scalar、object、list 采用 strict no-coercion validation；ResourceSlot 在本轮 fail closed，等待
  下一 round 由应用装配层注入 Material readonly projection；
- 起点、断点、target node、FE revision hint 均不进入普通 WorkflowTask payload。

当前证据：focused form/unit 为 `19/19 passed`，workflow-editor 为 `17 files / 106 tests passed`，
services 为 `10 files / 68 tests passed`，根级 typecheck 与 runtime static contract 通过；真实 OS
Authoring browser suite 为 `7 passed`，其中 scalar 用例精确验证 request omission、OS canonical
default、snapshot revision，并保持 forbidden request / WebSocket / pageerror / application error 为
`0`。完整全仓 test、Web/Desktop build、exact-SHA 独立双审与 publication 在候选门禁完成后补记。

## Candidate editor round ledger（2026-08-02）

本轮唯一独立 test-author 为 `/root/i1_fe_io_editor_red`，tests-only 分支
`test/i1-workflow-io-editor`。测试原始提交与实现分支 cherry-pick 对应如下：

| 行为 | tests-only 原始提交 | 实现分支提交 |
|---|---|---|
| Candidate I/O mutation 与原工作台 markup RED | `ae1301e85fc1c45da7bacc2e1bcfabb8d199232b` | `1cdf06f` |
| 真实 OS Candidate browser fixed point | `12fde5b119048fd2f34bbebaa0f0faadfaeb5250` | `b2c1789` |
| D-068 显式同名 output 保留 | `0d6aed62984cb3330bb42f8aae39514fa5dd62fd` | `70587c4` |
| 真实 Catalog Handle identity 与 transport | `1f29dae15bd37f89814d2ced62ad56b5acc09e27` | `8c4bde0` |
| E2E OS diagnostic log | `4918843a19c759c77f38db7498c2fe2d01f4cbc8` | `662a7e6` |
| read/write graph fixed-point semantics | `07be80e22e9004bec3514bfac685f7da2a924ef0` | `e3f88ee` |
| ReactFlow MiniMap 外真实 pointer click | `164adf6dac524c9a210b8cbba95488520b81de2a` | `a526f7e` |

Production 实现提交为：`0d3c33b`（I/O contract mutation）、`4261060`（保留原布局）、
`85cd791`（OS Validate gate）、`25707a8`（closed Authoring transform response）、
`4bee7ae454a9ce1dad778c1bdaf802dcd407e2c2`（完整 v1 schema、ordered descriptor、
稳定 target identity、直接 unbind 与 ResourceSlot required/default 语义）。

独立 reviewer 对 `fa365fc4822a6649e076f586891db40cbcfacb12` 的首次精确审查为
Standards `0B/0NB`、Spec `3B/2NB`。唯一 test-author 为五项审查发现补入 tests-only
`826a52aa4d446ed06f3878c93c2ca4aeef6c090d`，实现分支 cherry-pick 为 `182843c`；
补测先得到 `9 failed / 14 passed`，再由 `4bee7ae...` 收敛为 `23/23 passed`。

核心合同：

- selector label 只用于显示；持久化只使用 selected graph 中 Node owner 对应的真实 Handle UUID；
- input rename/delete 会同步清理 binding，output binding 只允许 Workflow input 或真实 source Handle；
- 所有 Workflow ResourceSlot input 在不存在显式同名 output 时合成 OS-managed 同名透传；
  显式同名 output 保留，其 schema assignability 由 OS 校验；Action target compatibility 与
  allowlist 传导是独立 binding gate，不是 D-068 合成前提；
- recursive nullable/list ResourceSlot schema 按 D-067 producer allowlist ⊆ consumer allowlist；
- JSON edit 先 generate canonical Python，再显式 Validate，最后沿用现有 diff/draft/apply；
- production 不按 label、`data_key`、Action 类型或 port ordinal 猜测 identity。

审查修复前 production head 为 `a526f7ec6593d9101eedda2d997a2f365b5a3df1`；审查修复
production head 为 `4bee7ae454a9ce1dad778c1bdaf802dcd407e2c2`。最终 exact-SHA
必须包含本 ledger，并由同一名独立 reviewer 完成 Standards/Spec 双审闭环。

根级 project-reference typecheck 随后发现一个只影响 TypeScript union narrowing 的门禁问题，
由 `2d790c85ffc22375c7ed61c4d8b4fa367661be67` 修复；它不改变 ResourceSlot/default
合同，审查补测仍为 `23/23 passed`。因此最终 review 前 production head 为 `2d790c8...`。

已完成证据：

| 门禁 | 结果 |
|---|---|
| workflow-editor unit/component | `15 files / 99 tests passed`；其中审查补测 `23/23 passed` |
| services unit | `8 files / 59 tests passed` |
| 真实 OS Authoring browser suite | `6 passed`；forbidden request / WebSocket / pageerror / application error 为 `0` |
| OS retained Catalog projection | OS candidate `ee6b23ec715fb3253686f654ab80375c32ba51fb`、integration `96f96ff42be7da881f2b6e6d81e6462e12daf1c6`、Standards/Spec `0B/0NB` |
| FE 根级门禁 | 全仓 typecheck/test、Web build、Desktop build、runtime static contract 与 diff-check 均通过 |

全仓 typecheck/test、Web/Desktop build、runtime static contract、diff-check 与本轮 exact-SHA
review 结果在最终候选门禁后记录到 repository-local ticket；Task form 不混入本 round。

## Outcome 与基线

本轮在原 `PersistentWorkflowAuthoringPanel` 中增加 Workflow Input/Output definition、真实
Handle binding 与由 Applied Contract 生成的 Task 启动表单。OS 继续拥有 schema、默认值、
类型兼容、ResourceSlot 解析、Apply 和 Task snapshot 的最终权威；前端只编辑 Candidate、
展示 diagnostics 并提交用户明确输入。

跨仓合同由
[Core #154](https://github.com/Uni-Lab-OS/Uni-Lab-Core/issues/154) 冻结。FE 实现基线固定为
`integration/fe-os-migration@a641fa6fa38b223ec90648a2c308c67d4a57b6fd`，实现分支为
`migration/i1-workflow-io-authoring`。OS dependency 基线为
`integration/workflow-task-runtime@91b00dd030483058a6d0aafc42f143de829cc1bc`。

跨仓验收门为
[Core #157](https://github.com/Uni-Lab-OS/Uni-Lab-Core/issues/157)。

### 2026-08-02 continuation 基线

旧 implementation branch 只保留冻结 spec provenance。当前续作从最新远端
`integration/fe-os-migration@ff12bfa033a67045732e7fa738b9e4a9979d71e5`
建立 `migration/i1-workflow-io-authoring-ff12`。本轮唯一独立 test-author 的首个 RED 为
`d60869a7d2c8cd2154cf72206e024bbbcf91ec98`，对应 services typed-contract GREEN 为
`8d8c57f`。后续 integration/E2E/review 必须固定续作分支 exact SHA；不得把
`a641fa6...` 表述为当前 production 起点。

本轮复用现有 `packages/workflow-editor`、`packages/services/src/workflow.ts`、
CodeMirror、DAG、Debugger 与 Output，不建立第二套工作台、第二个 Workflow store 或
OS/backend 分叉组件。

## Phase 02H 已完成，FE 不复制其权威

OS Phase 02H 已完成：

- Task create 前 v1 input preflight；
- default/null/closed schema 与 strict normalization；
- ResourceSlot resolver port 和 `400/404/409` 映射；
- canonical `WorkflowTask.input`、exact snapshot、Job param 原子写入；
- target Handle UUID input binding 与零 partial write。

I1 FE 不实现一套可与 OS 分歧的 preflight，不在浏览器 materialize authoritative defaults，
不根据字段名/Action 名/port ordinal 猜类型或 Material。前端本地校验只为即时 UX；Task 是否
可创建及 canonical input 仍由 OS 决定。历史 OS Phase 02H ticket 不得复制为 FE I1 scope。

## 统一 service seam 与 typed projection

所有 I1 UI 继续只依赖 `packages/services/src/workflow.ts` 的 `WorkflowRuntimePort`。组件不得
直接 `fetch` Authoring、Graph、Task 或 Material API，也不得从 profile id 推断能力。

services 增加与 Core #154 closed wire 一一对应的 discriminated types/decoder：

```ts
type WorkflowValueSchema =
  | { type: "string"; /* frozen finite constraints */ }
  | { type: "integer"; /* frozen finite constraints */ }
  | { type: "number"; /* frozen finite constraints */ }
  | { type: "boolean" }
  | { type: "object" }
  | { type: "array"; items: WorkflowValueSchema }
  | { $slot: "ResourceSlot"; allowed_resource_template_uuids?: string[] }
  | { anyOf: [WorkflowValueSchema, { type: "null" }] };

type WorkflowInputBinding = { parameter: string };

type WorkflowOutputBinding =
  | { kind: "workflow_input"; parameter: string }
  | {
      kind: "node_output";
      workflow_node_uuid: string;
      source_handle_uuid: string;
    };
```

实际类型还必须包含 ordered Input/Output descriptor 与 v1 envelope，并精确表达：

- input 的 `required/default/title/description`；
- output 没有 `required/default`；
- output `implicit` 是 server-managed readonly；
- Node input binding map 的 key 是真实 target Handle UUID；
- root output binding map 的 key 是 Output Contract name。

runtime decoder 对 malformed envelope、unknown binding variant、unknown schema discriminator 和
非法 nullable shape fail closed，不把它降级成 `Record<string, unknown>` 后交给组件猜测。
opaque JSON object 的 value 内容可以开放，但其 descriptor/schema envelope 仍 closed。

`WorkflowAuthoringGraph`/aggregate 必须投影真实 WorkflowNodeTemplate、
WorkflowHandleTemplate identity、schema 与 I/O metadata。ReactFlow nodes/edges 仍只是视图，
不得成为 Apply payload 或 binding authority。

## Workflow I/O authoring UX

在现有 authoring panel 中增加两个可访问的编辑区域：

1. **Workflow Inputs**：按 contract 顺序编辑 name、type/schema、required、default、nullable、
   title、description，并把 input 绑定到 Node 的真实 target Handle；
2. **Workflow Outputs**：按 contract 顺序编辑 name、type/schema、title、description，并从
   Workflow input 或 Node 的真实 source Handle 中选择唯一 producer。

交互规则：

- selector 可以显示 Node/Handle label 帮助用户，但保存值只能是稳定 UUID/name contract；
- source selector 只列 source Handle，target selector 只列本 Node 的 target Handle；
- 已有 Edge、static param 与 Workflow input binding 冲突时，在 Apply 前展示 OS diagnostic，
  不由 UI 静默删除其中一个 provider；
- `implicit: true` output 以只读行展示来源和 schema，不能由用户新增、删除或切换；
- required/default/nullable 的非法组合在 UI 即时提示，但仍以 OS Validate/Apply 为权威；
- opaque object 使用明确 JSON editor，不从当前 object keys 生成永久字段 schema；
- `AllowedResourceTemplates` 只消费 A1 Catalog 发布的 symbol/UUID 投影，不从 display name 猜 UUID；
- Catalog fingerprint stale 时保留当前编辑内容，显示需刷新/重新选择，不自动重绑定。

JSON 与 Python 是同一 Candidate 的两个视图。JSON-side I/O 编辑修改 Candidate 后必须通过
OS `authoring/generate-python` 生成 canonical result-record Python；Python-side 编辑必须通过
OS compile 返回 Candidate。保存/Apply 前调用 OS validate，reserved I/O metadata 只能通过
Authoring Apply 原子提交，不能用普通 Graph PUT 或 metadata PUT 绕过。

canonical Python output 使用与 Action 相同的 `TypedDict`、frozen dataclass 或兼容 inline
return-annotation dict。前端不生成、解析或执行 Python；旧 `workflow_output(...)` 即使被 OS
作为 migration input 接受，CodeMirror 收到的 normalized source 也必须是 result-record
canonical form，不在 UI 暴露双轨开关。

## Applied-contract Task 启动表单

普通 Run 按钮继续调用现有 WorkflowTask controller，但在 create 前展示由当前 Applied
Workflow 的 Input Contract 生成的表单。Candidate/Draft 尚未 Apply 的 I/O 改动不得成为 Task
payload；UI 应明确提示本次执行使用 Applied revision。

表单值必须区分三种状态：

```text
untouched / omitted
explicit null（仅 nullable 输入可选）
explicit value
```

默认值显示为 OS contract 提供的提示或初始展示，但 untouched 字段提交时省略，让 OS 应用并
冻结 default。`false`、`0`、`""`、`[]` 与 `{}` 是显式值，不能被 falsy 过滤成 omission。
前端不得用字符串 coercion 生成 integer/number/bool；结构化值和 list 按 frozen schema 使用
typed control 或 JSON editor。

点击提交前先 rehydrate Applied aggregate，重新建立表单所依据的 revision。按 OS public
contract，`POST /api/v1/workflow-tasks` 不携带 expected revision，也不新增 FE 私有字段。创建
成功后以返回的 `WorkflowTask.workflow_snapshot`/revision 和 canonical `Task.input` 为准；若
实际 snapshot revision 与表单起始 revision 不同，UI 明确提示已使用更新后的 Applied
snapshot，并重新投影表单，而不是声称执行了旧 revision。

`WorkflowTaskController.create()` 扩展为接受已验证的 `input` object，但普通 Task payload 仍
只包含共享字段；起点、断点等 Debugger preview state 不进入普通 Task payload。

## ResourceSlot selector 与 codec

ResourceSlot control 显示 Material identity、类型和必要的状态摘要，但只提交：

```json
{"uuid": "<material_uuid>"}
```

严禁提交 `resource_template_uuid`、MaterialAggregate、Material tree、index、label 或前端生成的
临时 identity。`list[ResourceSlot]` 保持用户顺序和重复项；UI 不 flatten、不自动去重。

Material options 通过应用装配层注入的窄只读 port 获得，优先复用
`packages/services/src/materials.ts` 已有 Material projection；workflow-editor component 不直接
fetch，也不依赖 Material Zustand store 作为执行真值。FE 可按
`allowed_resource_template_uuids` 过滤/标注选项改善 UX，但 OS 必须重新校验。

错误展示保持权威分类：

- `400 invalid_input`：字段 shape/type/template mismatch；
- `404 not_found`：选择的 Material 不存在或已 soft-delete；
- `409 conflict`：Material Authority 报告稳定冲突或 resolver 尚未可用。

Core #154 尚未冻结 Task error envelope 的字段级扩展。存在 OS JSON Pointer diagnostics 时可
定位到 control；Backend/OS 不提供时正常降级到 form-level actionable error，不伪造“后端字段
诊断”。Reservation pending、占用详情与自动选择属于 M1/M2，不在 I1 前端推断。

## Output 停止线

I1 可以编辑并展示 Workflow Output Contract/Bindings，但不提前实现 O1：

- 不从 Job `return_info`、feedback 或 DAG 状态拼装 WorkflowTask output；
- 不在 running、failed、canceled 等状态展示 partial output；
- 不把现有 `WorkflowOutput` 的 Job/feedback surface 改称 Workflow result；
- 不因 Output Contract 已存在就乐观显示成功结果。

完整、原子、仅成功终态可见的 `WorkflowTask.output` 由 O1 交付。在此之前保持当前 Runtime
projection，不新增第二个 result store。

## RED → GREEN slices

治理阻塞解除后，按以下 slice 实施：

1. **Typed contract**：services decoder/types 对 malformed/unknown schema 和 binding 先 RED，
   再替换 workflow-editor 内泛化 I/O Record；
2. **Read-only projection**：先在现有 panel 展示 Applied input/output 与真实 Handle，再加入
   Candidate editor；
3. **Authoring mutation**：验证 JSON edit → OS generate-python → validate → Apply → reload
   fixed point，并证明 diagnostic 时保留 buffer；
4. **Task form**：补 omission/null/default/falsy/strict control 与 controller request RED；
5. **ResourceSlot**：补窄 option port、allowlist UX、只 `{uuid}` request 和 `400/404/409`；
6. **真实联调**：固定 FE/OS exact SHA，完成 scalar gate；A1 ready 后补 Catalog/result-record，
   M1 ready 后补真实 ResourceSlot success/conflict。

FE unit/component tests 至少覆盖：

- closed schema decoder、ordered descriptor、nullable/default 合法矩阵；
- input/output reorder、rename、delete、binding orphan 和 implicit readonly；
- selector 保存真实 Handle UUID，不保存 label、data_key 或 ordinal；
- Python/JSON 切换、Apply、reload 后 contract/binding 不漂移；
- compile/validate/Apply error 保留编辑文本与最后一个 valid Candidate；
- Task form untouched omission、explicit null、false/0/empty values、no coercion；
- controller 发送准确 input，普通 Task payload 不含 debugger preview；
- ResourceSlot 只发送 `{uuid}`，list 顺序/重复保持，caller template UUID 为零；
- snapshot revision 竞态提示与 canonical `Task.input` rehydrate；
- I1 不新增 Task output 聚合、旧 Run/WS/Task-scoped event 或 timer polling。

真实 OS Playwright gate 至少覆盖：

1. 编辑 input/output、绑定、Apply、reload 与 Python/JSON fixed point；
2. required/default/null/opaque object/list 的准确网络 payload 与 canonical Task input；
3. 错误 Handle、unknown binding、stale Catalog/revision 的 fail-closed UX；
4. A1 后的 `AllowedResourceTemplates` round-trip；
5. M1 后的 ResourceSlot `{uuid}` success、404 和 409；
6. 全程无 forbidden request、Runtime WebSocket、pageerror、application error 或 polling。

最终候选运行 `pnpm typecheck`、`pnpm test`、`pnpm build:web`、
`pnpm build:desktop`、相关真实 OS workflow E2E 和 `git diff --check`。E2E、review 与报告必须
固定 exact SHA；任何 production change 都使对应证据失效。

## Governance decision 与可移植性

[Core #158](https://github.com/Uni-Lab-OS/Uni-Lab-Core/issues/158) 已 Accepted，并明确
supersede Core #104 的 2 test-author / 3 reviewer 数量要求。I1 每个 round 使用恰好一名
test-author、一名 implementation owner 和一名 reviewer；同一 round 严格串行，A1/I1/M1
可以在隔离 branch/worktree 中并行。FE production implementation 仍必须先取得独立 RED
commit。

`packages/services` 的 typed port 是 FE 唯一可移植边界：组件不得依赖 snake_case wire row、
FastAPI/SQLite 细节、浏览器全局或某个部署 profile。Web、Desktop 与测试 adapter 必须消费
同一 canonical DTO/diagnostic semantics；更换 OS transport 或持久化 adapter 不得要求复制
schema store 或改写 Workflow editor domain model。

## Non-goals

- 不重做 Phase 02H preflight、Task snapshot、ResourceSlot resolver 或错误映射；
- 不新增第二套工作台、Workflow store、schema source、Python interpreter 或 backend-specific
  component；
- 不加强/旁路 `@action` decorator，不让 FE 定义 Action schema；A1 负责 Catalog；
- 不做 Material allocation、Reservation/Claim、MaterialSource、Site mutation 或自动选择；
- 不做 Composite authoring/runtime、ExecutionPlan admission、device execution 或 Debugger Hold；
- 不修改共享 Task request 增加 expected revision，不恢复 Run DTO/Runtime WebSocket/轮询；
- 不提前实现 O1 `WorkflowTask.output`。
