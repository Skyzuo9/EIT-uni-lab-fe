# A1：Action Catalog 与原工作流编辑器接入设计

日期：2026-08-01

实现分支：`migration/a1-action-catalog-e2e`

Frontend 基线：`integration/fe-os-migration@95c0720`

OS 合同基线：`integration/workflow-task-runtime@21e42beee58062abcf3417841e2db4c44a154dc9`

跨仓协议权威：[Uni-Lab-Core #153](https://github.com/Uni-Lab-OS/Uni-Lab-Core/issues/153)

跨仓验收门：[Uni-Lab-Core #159](https://github.com/Uni-Lab-OS/Uni-Lab-Core/issues/159)

状态：**HUMAN APPROVED / IMPLEMENTATION AUTHORIZED — 2026-08-01。用户已完成本 spec
评审并授权在真实 OS TemplateCatalog HTTP 上接入原 Persistent workbench。**

## 1. 结果边界

本轮只把 OS 从现有 `@action` schema 投影出的 authority-scoped Catalog 接入原
`PersistentWorkflowAuthoringPanel`：

```text
OS persisted TemplateCatalog snapshot
  -> packages/services typed adapter
  -> packages/workflow-editor catalog projection
  -> 原节点 editor / DAG / Python-JSON Authoring lifecycle
```

前端不建立 Action schema、Handle、Catalog 或 Workflow 的第二权威。typed contract 只能是
现有 `@action` decorator schema 的兼容扩展；FE 只消费 OS 已解析并持久的
WorkflowNodeTemplate/WorkflowHandleTemplate 与 fingerprint。

## 2. 当前基线证据

- `packages/services/src/laboratory.ts` 已请求
  `GET /api/v1/workflow-node-templates`，但当前 fixture 是薄 `items` DTO；adapter 通过拆分
  `item.id` 最后一个 `.` 猜 `deviceId/actionName`，并丢弃 Template/Handle UUID、io type、
  ResourceSlot allowlist、editor control 与 fingerprint。
- 该 service 还把 Action template 冒充 online device action，并静态填入
  `isBusy=false`；这不能作为 Workflow Catalog identity。
- `packages/workflow-editor` 的 Persistent panel 已是 Authoring 唯一工作台，但当前节点编辑
  只改名称，DAG card 使用泛化 source/target Handle，未消费真实 Handle templates。
- JSON↔Python、Draft/Candidate/Apply、Debugger、Output 与 UI1D Runtime 已有单一生产入口；
  A1 必须深化它们，不能另建 Action builder 或平行画布。

## 3. 范围与 non-goals

### 3.1 本轮范围

1. 在 `packages/services` 为 Backend-shaped NodeTemplate/HandleTemplate Catalog 建立严格
   typed adapter，保留 authority、fingerprint 与全部稳定 identity。
2. 将 catalog snapshot 作为现有 Persistent Authoring panel 的只读依赖，不写入新的
   Zustand/Redux 业务 store。
3. 在现有节点编辑区域展示 typed 参数、required/default/null、enum、结构化值、
   ResourceSlot/Site control 和结构化诊断。
4. 以真实 target/source Handle UUID 投影 DAG 端口与 WorkflowEdge。
5. 保存、刷新、Python/JSON 切换继续走现有 OS Authoring Interface，并保持 Catalog
   fingerprint/identity。
6. 删除 A1 production path 中的字符串拆分、字段名和端口 ordinal 猜测。

### 3.2 明确不做

- 不增加第二个工作流 workbench、Action builder、Catalog store、运行状态机或 renderer。
- 不在浏览器解析 decorator、Python annotation 或 `x-unilabos-action-contract` 成另一份
  canonical contract。
- 不执行用户 Python，不在客户端编译 Graph，不伪造 Handle UUID/fingerprint/diagnostic。
- 不把未装饰 `auto-*` action 补进目录；OS 未发布即不可选。
- 不根据 Action 名、字段名、type 字符串、端口顺序或旧 `handles` 猜 Material/变量语义。
- 不实现 M1 Reservation/Claim、Material 冲突决策、M2 selector、ExecutionPlan、设备执行、
  Task output 或 Debugger Hold。
- 不把模板 identity 与在线 device instance 混为一体，不显示伪造的 busy/online 状态。
- 本轮在独立 RED 与 exact-SHA review 门内修改 production/test source。

## 4. services 深模块 Interface

Catalog transport 只由 `packages/services` 读取和校验。workflow-editor 调用一个小 Interface：

```ts
getWorkflowActionCatalog(): Promise<WorkflowActionCatalogSnapshot>
```

返回的 immutable projection 至少保留：

```ts
interface WorkflowActionCatalogSnapshot {
  authorityId: string
  authorityKind: 'local' | 'backend'
  fingerprint: string
  nodeTemplates: WorkflowActionTemplate[]
}

interface WorkflowActionTemplate {
  uuid: string
  resourceTemplateUuid: string
  name: string
  displayName: string
  actionClass: string | null
  actionType: string
  schema: Record<string, unknown>
  goal: Record<string, unknown>
  goalDefault: Record<string, unknown>
  handles: WorkflowActionHandleTemplate[]
}

interface WorkflowActionHandleTemplate {
  uuid: string
  workflowNodeTemplateUuid: string
  handleKey: string
  ioType: 'target' | 'source'
  displayName: string
  valueType: string
  required: boolean
  dataSource: string | null
  dataKey: string | null
  valueSchema: Record<string, unknown>
  editorControl: 'material_port' | 'site_selector' | 'variable_selector'
  allowedResourceTemplateUuids: string[] | null
  implicitPassthrough: boolean
}
```

Wire DTO 保持 OS/Backend snake_case；camelCase 仅是 services 内已验证的调用投影。公共
HTTP exact envelope/list-detail shape 由 Core #153 integration spec 与 OS implementation
spec 共同固定。adapter 必须整体拒绝 malformed snapshot、重复 UUID、错误 Handle parent、
未知 `io_type`/editor control、非法 allowlist 或缺失 fingerprint；不得静默过滤坏 item 后
返回部分 Catalog。

`getWorkflowActionCatalog()` 是 remote-owned seam 的 production HTTP adapter；测试使用
显式 in-memory adapter。schema 解析、identity index、父子校验和错误归一化都隐藏在该
module implementation 内，workflow-editor 不接触 raw envelope。

现有 direct-device `DeviceAction` 可以继续服务非 Workflow 页面，但不得再作为 typed
Workflow template DTO。特别禁止继续通过：

```ts
const separator = actionRef.lastIndexOf('.')
```

恢复 device/action identity。Action template 属于 ResourceTemplate，在线 device instance
由后续 executor selection 独立绑定。

## 5. 原 Persistent workbench 的 Catalog 投影

### 5.1 唯一 owner

`packages/workflow-editor` 继续拥有文档、CodeMirror、DAG、节点编辑、Debugger 与 Output。
Catalog snapshot 只是只读依赖；React Flow nodes/edges 仍是 Backend-shaped Authoring Graph
的视觉投影，不成为保存载荷权威。

禁止新增另一个 Action sidebar+canvas 组合。现有设备/节点目录、节点 editor、
`SchemaForm`/参数 form 和 `WorkflowNodeCard` 可在不产生双状态时复用或深化。

### 5.2 节点与端口

- Node 只引用真实 `workflow_node_template_uuid`；label、icon 与 parameter form 来自对应
  template。
- 每个 Handle 使用真实 Handle UUID 作为 React Flow handle id；不再渲染与 catalog 无关的
  单一泛化 source/target 端口。
- `io_type=target` 是输入，`io_type=source` 是输出；顺序只用于稳定展示，连线语义只看
  UUID/io type。
- `material_port` 展示 Material/ResourceSlot 端口和类型 allowlist；`site_selector` 展示
  Site 选择 control；`variable_selector` 展示 scalar/object/list 的 literal、Workflow
  input 或 upstream output provider。
- implicit pass-through output 必须带明确只读标记，FE 不创建、删除或重命名它。
- OS 未发布 auto-action，因此 FE 不维护 auto-action allow/deny 名单或 fallback。

### 5.3 provider 与持久化

一个 target Handle 最多有一个 provider：

| provider | Backend-shaped 持久位置 |
|---|---|
| static literal / 明确 Material reference | `WorkflowNode.param` 对应 data key |
| Workflow input | reserved Node input binding |
| upstream Action output | 使用真实 source/target Handle UUID 的 `WorkflowEdge` |
| 未提供 | 仅 optional/default 合同允许 |

FE 不把 schema default 自动写入 Node param；它可以显示 default，但保存值必须来自用户明确
编辑或 OS normalized Candidate。缺失、显式 `null` 与空 list/object 必须分别保留。provider
切换必须原子地产生无歧义候选，不能短暂留下 param、binding 与 Edge 三重来源。

ResourceSlot/Site 的真实存在性、占用和兼容性由 OS/M1 校验。A1 UI 只展示 Catalog
constraint 和 OS diagnostic；在 M1 selector read seam 尚未交付时不得使用静态材料数组或
乐观“已分配”状态补齐体验。

## 6. Authoring 保存与 fingerprint

- Catalog load、Node editor mutation 与 Run 前保存继续汇入现有 Persistent Authoring
  lifecycle；组件不得直接 `fetch` 或调用 Graph row CRUD 拼保存。
- Python→Graph 只调用 OS compile/validate；Graph→Python 只调用 OS generate-python。
- Candidate/Apply 使用 OS 返回的 catalog fingerprint。`409 template_catalog_conflict` 时保留
  dirty Python/DAG buffer，刷新 Catalog 与 Authoring aggregate，并要求重新编译。
- 保存/刷新后按 NodeTemplate/Handle UUID 复原表单和连线；不能按 display name、field
  name 或数组位置重建。
- 当前 Applied Workflow 引用 Catalog 已删除或换 UUID 的 Handle 时 fail closed 并展示
 诊断；不得将 Edge 重绑到“看起来同名”的 Handle。

## 7. 诊断与降级

services 将 OS error envelope 归一为现有 `ServiceError`，但保留 machine code、HTTP status、
message 和安全的 schema/Handle path。workflow-editor 的展示规则：

- `invalid_action_contract` / `invalid_schema`：对应 Action 不可加入 Workflow；
- `action_default_contract_conflict` / `action_handle_contract_conflict`：明确提示 Registry
  声明需修复，不能由用户在画布覆盖；
- `template_catalog_unavailable`：编辑器保持当前 dirty buffer，只读显示最后 Applied Graph，
  禁止创建/Apply typed Action；
- `template_catalog_mismatch`：定位 template/Handle field，禁止猜测修复；
- `template_catalog_conflict`：提示刷新并重编译，不清空编辑内容；
- `invalid_input`：优先绑定到真实 target Handle UUID/field path；无法定位时进入节点级诊断。

Catalog 请求失败且没有经当前 authority+fingerprint 验证的 snapshot 时 fail closed。不得回退
Cloud 旧 panel、静态 JSON、测试 fixture、live device action list 或上一 profile 的缓存。

## 8. 建议实现切片

1. **A1-FE-0 contract adapter**：替换薄 fixture/ID 拆分，建立 strict Catalog DTO、identity
   index、authority/fingerprint cache key 和 malformed response diagnostics。
2. **A1-FE-1 typed node projection**：原 Persistent panel 使用真实 template/Handle UUID，
   渲染 typed ports、required/default/null 与 read-only implicit output。
3. **A1-FE-2 provider editor**：在原节点 editor 中接入 literal/workflow-input/upstream
   provider，维持唯一 provider；Material/Site 仅消费已交付 authority seam。
4. **A1-FE-3 round-trip**：通过现有 compile/generate-python/Draft/Apply 保存，处理 Catalog
   conflict、refresh 与 structured diagnostics。
5. **A1-FE-4 cross-repo gate**：连接真实 OS persisted Catalog，删除 production heuristics，
   产出 Python/JSON/DAG 与刷新证据。

这些切片属于同一个 A1 owning round；不得先写前端假 DTO 再等待 OS，也不得把未合入切片
堆成新 round。

## 9. 测试与接受门

独立 RED 至少覆盖：

- services exact route/envelope、snake_case→typed projection、authority/fingerprint 隔离；
- malformed/partial Catalog、重复 UUID、错误 parent、未知 editor control 全部 fail closed；
- production source 不再拆 `actionRef`，不按字段名/Action 类型/ordinal 猜 Handle；
- auto-action 不出现，legacy handles 不成为 FE 输入；
- required/default/nullable/enum/object/list/ResourceSlot/Site 的 form 与可访问诊断；
- target/source Handle UUID、implicit pass-through、合法/非法 Edge 连接；
- literal/workflow input/upstream output provider 互斥，切换后无残留双 provider；
- default 只展示不偷写，missing/null/empty collection round-trip 不混淆；
- 保存、刷新、Python→JSON→Python 后 Node/Handle UUID、参数和连线不漂移；
- fingerprint 409 保留 dirty buffer 并要求重新编译；
- profile/authority/fingerprint cache 隔离，无 static/live-device fallback；
- 真实 OS E2E 使用 persisted Catalog 与原工作台，不用 `page.route` 伪造成功。

最终至少执行：

```bash
pnpm --filter @unilab/services typecheck
pnpm --filter @unilab/services test
pnpm --filter @unilab/workflow-editor typecheck
pnpm --filter @unilab/workflow-editor test
pnpm typecheck
pnpm test
pnpm build:web
pnpm build:desktop
pnpm test:e2e:workflow-authoring
pnpm test:e2e:workflow-debug
```

Core gate 固定 OS/FE exact SHA，证明同一 Action 在 Python、JSON、DAG 中端口/类型一致，
Catalog 更新产生 fingerprint conflict，保存/刷新 identity 不漂移，非法类型/缺参/错误
Handle 由 OS 拒绝，浏览器无 `console.error`/`pageerror`，且不存在 parallel workbench。

## 10. 本轮授权与门禁

用户在本会话中完成 OS/FE spec 评审并明确授权实现。A1 作为同一跨仓 owning round，按 OS
仓 `AGENTS.md` 使用同一名独立 test-author 与同一名独立 reviewer：

- FE 从当前 `integration/fe-os-migration` 建独立分支，并固定 OS integration SHA；
- test-author 先提交 services/workflow-editor RED，不写 production；
- FE 只消费真实 OS persisted Catalog，不以 page route、静态 fixture 或 live device list
  冒充 E2E；
- 最终 reviewer 同时检查 OS/FE exact SHA 与 SZLab 证据；除非用户另行要求，不修改远端
  GitHub issue 或 stage。
