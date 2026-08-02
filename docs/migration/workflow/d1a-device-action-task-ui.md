# D1A-S1 设备页单 Action Task：前端实施规格

状态：Implementation baseline  
上游协议：`Uni-Lab-OS/Uni-Lab-Core#162`  
FE delivery：`Uni-Lab-OS/uni-lab-fe#19`  
Integration gate：`Uni-Lab-OS/Uni-Lab-Core#163`  
实施基线：`6b0733f3c8d6e02c663c1728e0d2fa4e81a561fa`

## 1. Outcome 与复用边界

恢复仪器设备页原有“选择 Action、填写参数、运行”的能力。保留现有
`DevicePanel`、设备列表/头部、Action 卡、`ActionParameterForm`、localStorage draft、
锁状态、手动解锁对话框和既有反馈/结果视觉语言；只替换当前 disabled
`DeviceActionAvailability` 与运行 controller，不复制或重做页面。

前端只消费公开 A1 template identity、具体 device identity 和
`DeviceActionTaskView`。system Workflow/Node/source 是 OS 内部事实，禁止进入 TypeScript
DTO、React state、localStorage、网络反查或 UI。

## 2. Service port

`packages/services` 拥有 D1A wire adapter。新增窄 port：

```ts
interface DeviceActionTaskRuntimePort {
  createDeviceActionTask(request: DeviceActionTaskCreateRequest):
    Promise<DeviceActionTaskView>
  getDeviceActionTask(taskUuid: string): Promise<DeviceActionTaskView>
}
```

请求字段严格为：`authority_id`、`template_catalog_fingerprint`、
`workflow_node_template_uuid`、`device_id`、closed `input`、调用者 UUID
`idempotency_key` 和可选 `description`。禁止 `action_name`、`workflow_uuid`、Node UUID、
source revision/content/path。

adapter 只接受既有 Backend envelope，按稳定 code 映射可行动错误；不得接受裸对象、
FastAPI `detail` 或 2xx 即成功。D1A view 类型本身不得声明任何 system source 字段，
运行中的普通 cancel/feedback 复用现有 Workflow runtime port。

## 3. Catalog 与 live device 关联

设备目录继续由 `LaboratoryService GET /api/v1/devices` 读取；typed Action 身份来自
`WorkflowRuntimePort.getWorkflowActionCatalog()`。controller 只在以下条件全部成立时
启用运行：

- profile capability 显式允许 D1A；
- Edge health/connection online，具体 device online；
- A1 snapshot 可用且有匹配的 template UUID/fingerprint；
- live device Action 与 A1 template 的 owner/action 合同唯一匹配；
- template 不含 `material_port`、`site_selector`、ResourceSlot 或 implicit pass-through；
- 当前没有 POST pending，表单可严格序列化。

为避免 UI 按名称猜 identity，`packages/services` 的设备投影应携带 OS 已公开的 A1
template UUID/fingerprint 关联，或 controller 用同一 snapshot 中的稳定 owner/action
business key做唯一 join；匹配为零或多于一项时 fail closed 并解释原因。

## 4. Controller 与交互状态

新增 hook/controller 管理：catalog load、form validation、caller idempotency UUID、POST
pending、当前 Task projection、feedback cursor、SSE invalidation、cancel 和错误。React
组件只发 command intent，不直接 `fetch`。

- 同一次用户点击生成一个 UUID；pending 时按钮禁用，React 重渲染不得生成新 key；
- transport 结果未知时保留同 key供用户显式重试，不能生成第二个 Task；
- 收到 201 只显示“任务已接受/等待设备”，不显示运行成功；
- SSE `device_action_task.changed` 只触发 GET rehydrate；Task/Job REST 和设备目录是
  真值；
- `409 template_catalog_conflict` 清除运行确认态，刷新 Catalog/表单并要求用户重新
  确认，不自动提交旧 input；
- busy 不由浏览器排队或轮询推进；显示 durable pending/admission-blocked；
- cancel 走现有 Task command并区分 accepted 与生效；手动解锁保持独立二次确认；
- terminal output/feedback 进入原设备页的反馈/输出区域，Action free 后允许同一 Action
  再运行。

参数序列化只按 A1 schema接受 JSON scalar/list/object；不做字符串转数字等便利
coercion。现有 input 控件无法无损表达的合同保持禁用并解释“请在工作流中运行”。

## 5. Capability

在 `ServerCapabilities` 增加明确 D1A capability，只有当前 OS local profile 为 true；
未知 profile deny-by-default。capability 描述服务端已完整实现的语义，不通过 404
探测，也不在组件中按 backend id 分支。

## 6. 测试 seam

仓内 tests 固定以下公开行为：

1. services 请求路径、strict envelope/error、DTO 无 system source 字段；
2. 原 Action 卡/参数/draft/锁/解锁组件继续存在，只有运行 availability/controller
   改变；
3. capability/catalog/online/S1 scope 门禁、严格参数、pending 防重复、幂等重试；
4. stale Catalog 要求重新确认，unsupported/mismatch/admission error 可行动显示；
5. Task accepted/running/feedback/result/cancel 均来自注入 port，不乐观伪造；
6. 生产代码对 `/runtime/runs`、Runtime WebSocket、前端直连 Edge 和 system Workflow
   read route 的引用为 0。

真实 E2E 必须连接真实 local OS，不以 route mock 证明端到端。至少五张截图覆盖参数、
accepted/pending、busy+feedback、result、free+再次运行（若场景适用再增加 cancel/stale）；
network ledger 对旧 Run/WS、system source identity/read route、browser console/page error
均断言为 0。

## 7. Gate 与交付

候选运行 `pnpm typecheck`、`pnpm test`、`pnpm build:web`、`pnpm build:desktop` 及相关
真实 OS Playwright。FE #19 记录 exact candidate SHA/命令；Core #163 固定 OS/FE SHA、
截图和 ledger。接口迁移表在阶段结束时更新，但在 Core pin、Feishu Accepted 完成前
不把 D1A 标记为 accepted。
