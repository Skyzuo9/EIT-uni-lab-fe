# C1 Composite authoring frontend implementation

## 1. Outcome 与基线

本交付在原 `PersistentWorkflowAuthoringPanel`、`WorkflowDag`、CodeMirror、Debugger 和
Output 上增加 typed child Workflow 选择、boundary editing 与完整 internal graph
展开/收起。它不建立第二个工作台、第二份 graph state 或前端 expansion authority。

跨仓规范以 [Core #178](https://github.com/Uni-Lab-OS/Uni-Lab-Core/issues/178)
冻结的 C1-P1～P5 为准，OS owning delivery 是
[Uni-Lab-OS #19](https://github.com/Uni-Lab-OS/Uni-Lab-OS/issues/19)，跨仓门为
[Core #179](https://github.com/Uni-Lab-OS/Uni-Lab-Core/issues/179)。

实现起点：

- `integration/fe-os-migration@bd66e720a7cb25c9b39df57674f9b6ef9289b227`；
- 第一轮分支 `migration/c1-r1-published-workflow-catalog`；
- OS R1 合同稳定前，FE 只提交 spec 与独立 RED，不写 fallback fixture 到 production。

## 2. Interface 与唯一数据源

深化现有 `packages/services/src/workflowActionCatalog.ts`，形成一个 authority/fingerprint
coherent 的 executable template Catalog decoder。它从同一组现有
`GET /api/v1/workflow-node-templates*` 路由读取 union，并按 schema discriminator 投影：

```ts
type WorkflowExecutableNodeTemplate =
  | WorkflowActionNodeTemplate
  | WorkflowPublishedNodeTemplate

interface WorkflowExecutableCatalogSnapshot {
  authorityId: string
  authorityKind: 'local' | 'backend'
  fingerprint: string
  actionTemplates: WorkflowActionNodeTemplate[]
  workflowTemplates: WorkflowPublishedNodeTemplate[]
}
```

Action 只接受 `x-unilabos-action-contract.version=1`；Published Workflow 只接受
`x-unilabos-workflow-contract.version=1` 且 `compatibility_version=1`。一个模板不能同时属于
两者，unknown template 可从 authoring picker 过滤，但同一已引用 graph template 仍由 Graph
projection 如实展示。所有 detail page 必须观察与 list 相同的 authority 和 fingerprint；竞态
fail closed。

`WorkflowRuntimePort` 只暴露一个 Catalog load Interface。原 Action editor 与新 Composite
picker 都从同一个 snapshot 派生，禁止分别请求两遍后拼接不同 fingerprint。组件不直接
`fetch`，不按 profile 分支。

## 3. Published Workflow typed projection

`WorkflowPublishedNodeTemplate` 至少包含：

- Node/ResourceTemplate UUID、`name=workflow:<workflow_uuid>`、display name；
- workflow UUID/revision、Applied source hash、contract digest；
- `compositionAllowTransparent`；
- ordered input/output contract names；
- Package source definition_fqid、absolute module、symbol、Catalog/content digest；
- boundary Handles 与其真实 UUID、value schema、required/default/null、ResourceSlot allowlist；
- ready target/source structural Handles；
- 原始 Backend-shaped wire value 作为 non-enumerable round-trip value。

decoder 严格验证：

- `type=node_type=workflow` 与 `framework_owner_only=true`；
- schema/provenance closed fields、digest/revision/hash 格式；
- input/output order 唯一且与 Handles 完整对应；
- Handle parent、direction、data source/key、value schema 与 structural role；
- workflow/action template 或 Handle UUID 全局重复；
- host_node ResourceTemplate 只作为 renderer owner，不显示为执行设备。

FE 不重算 contract digest、compatibility、UUID、allowlist intersection 或 mapping。

## 4. Canvas insertion 与 boundary editing

原 Action picker 扩为两个明确分组：`Action 模板` 与 `子工作流模板`。选择 child 时只创建
一个父级 invocation Node，使用 OS Published Workflow NodeTemplate 和真实 boundary Handles。
invocation UUID 使用现有前端新节点 UUID seam；FE 不创建 internal Node/Edge UUID。

Canvas buffer 只可编辑 parent-owned 字段：

- invocation name、pose；
- boundary literal / Workflow input / upstream output provider；
- external Edge 与真实 boundary Handle；
- 删除整次 invocation。

参数 editor 复用现有 typed field projection；Workflow input 与 Action input 使用同一 value
schema/default/null/ResourceSlot renderer。输出只通过真实 source Handle 连线。FE 不按字段名、
类型名或 ordinal 猜 material/variable 含义。

Canvas→Python 仍调用 OS `generateWorkflowAuthoringPython`，再经完整 diff 明确接受、Draft PUT、
Compile Preview、Apply。FE 不生成 absolute import、child call、mapping 或展开图。

## 5. Hierarchical Graph projection

`projectPersistentAuthoringGraph()` 从 OS Candidate/Applied graph 保留：

- 每个 Node 的 `parent_uuid`；
- Published Workflow invocation 的完整 composite metadata；
- internal Nodes/Edges，不丢弃 server-owned wire fields；
- target/source/structural mappings 与 child pin；
- nested parent chain。

一个引用 Published Workflow template 的 Node 投影为 `groupKind='subworkflow'`，其所有递归
descendants 由真实 `parent_uuid` 计算；不再使用旧 Canonical v2 `source_map` facade 推断 C1
层级。普通 presentation group 继续保持原语义。

内部 Nodes/Edges 在父 editor 中只读：

- 节点名、参数、pose、disabled/minimized、Handle、Edge 不可改；
- 不出现 Action parameter editor 或 connect/delete affordance；
- 可选择、检查、定位诊断，并提供“打开 child Workflow”导航；
- 外部 Edge 始终显示连接 invocation boundary，展开时也不重连 private Handle。

## 6. Session-only expand/collapse

复用 `WorkflowDag.expandedGroupIds` 方向，但 key 必须是 Composite invocation UUID，默认
collapsed。切换 workflow/revision、Authoring aggregate reload、页面刷新或 group signature
变化时重置；不写 local durable graph state。

展开/收起只调用纯 `projectNestedWorkflow()`：

- 保留完整 source Nodes/Edges；
- hidden/representative 只影响 ReactFlow visible projection；
- toggle 不触发 Node PATCH/PUT、graph save、Draft PUT、Generate、Apply、Task、SSE 或 timer；
- 不修改 `WorkflowNode.minimized`、pose、Candidate hash、Python 或 revision。

折叠 external Edge 显示在 boundary Node；展开恢复内部细节，但 external Edge 的原 wire
endpoint 仍是 boundary Node/Handle。映射可作为只读 inspector，不成为 visual Edge mutation。

## 7. Diagnostics 与 child evolution

OS machine code 原样进入现有 diagnostics panel：

- `composite_child_not_found`、`composite_child_unapplied`；
- `composite_recursive_reference`、`composite_contract_stale`；
- `composite_boundary_mapping_invalid`、`composite_external_private_edge`；
- `composite_resource_constraint_empty`、`composite_catalog_mismatch`。

exact/internal implementation update 与 additive update 显示需要重新 Compile/Apply；breaking
显示 stale boundary 并阻止 Apply。FE 不用当前 Catalog 悄悄改写旧 invocation，不乐观宣布
compatible，也不把 missing child 替换成 Action。

Apply/reload 后只安装 OS 返回的完整 aggregate。已 Applied parent 的 pinned internal graph 在
新 Candidate 出现前保持可读；Task/runtime 仍只使用父 Task snapshot。

## 8. 分轮 TDD

每轮使用恰好 1 test-author、1 implementation owner、1 exact-SHA reviewer；独立 RED commit
原样进入实现历史。

1. **R1 Published Catalog**：union decoder、discriminator、coherent fingerprint、exact workflow
   projection 与 picker；
2. **R2 Boundary editor**：insert invocation、typed providers、external Handle connection、内部
   write deny；
3. **R3 Hierarchical projection**：真实 parent_uuid、nested、mapping inspector、session-only
   expand/collapse、零网络写；
4. **R4 Lifecycle/E2E consumer**：reload、exact/additive/breaking、diagnostic presentation、
   stale/race 与 static gates。

每轮运行 targeted tests、workspace typecheck、全部单测、Web build、Desktop build 与
`git diff --check`。最终浏览器 E2E 使用真实 OS authority，并记录 request/response ledger、
console/pageerror、视觉证据与 terminal 后零轮询。

## 9. 明确不做

- 第二套 renderer、Cloud canvas、Canonical v2/source_map C1 authority；
- 前端 internal expansion、UUID/mapping/digest/allowlist/compatibility derivation；
- internal child graph 编辑；
- expand state 持久化或 `minimized` 重解释；
- Composite runtime/Job/nested Task、R2 lowering、O1 output、DBG step；
- Template Catalog→Registry、WorkflowSourceLibrary、静态/测试 Catalog production fallback；
- 组件直接 fetch、WebSocket、timer polling 或 Task-scoped event route。
