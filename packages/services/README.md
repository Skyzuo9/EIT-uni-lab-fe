# @unilab/services

前端访问 local OS、新 backend 和 Cloud adapter 的统一服务边界。UI 只依赖这里的
typed port，不感知请求最终落到哪一种部署。

## Profile 与能力矩阵

Profile 是一组完整连接配置，不是单个 base URL。它至少确定 backend 类型、HTTP/WS
地址、认证、作用域和 capability matrix。应用可以通过按钮切换完整 Profile；切换后必须
销毁旧 service/订阅并重建 Query 作用域。

当前默认语义：

| Profile | 物料能力 | 说明 |
|---|---|---|
| `local-python` / edge | `material.readGraph` | OS 从当前内存 `ResourceTreeSet` 投影统一 `MaterialAggregate`，只读 |
| `local-go` / backend | `material.readTemplates` | Go backend 有模板与行级 CRUD，但尚未提供统一 Material Graph 命令 |
| cloud | fail closed | 未来迁移；未实现能力不得显示为可用 |

非云本地作用域是 singleton，不发送伪造的 `laboratoryId`。同一路径或相同 JSON 字段不代表
同一业务语义；adapter 只有在能完整满足 typed port 时才能声明 capability。

## 物料端口

`src/materials.ts` 当前提供：

| 能力 | Services 方法 | 当前来源 |
|---|---|---|
| 模板列表 | `listTemplates` | Go backend `/api/v1/resource-templates` |
| 模板详情 | `getTemplate` | Go backend `/api/v1/resource-templates/{uuid}` |
| Material Graph | `getGraph` | OS 当前内存态经 `/api/v1/materials` 分页聚合投影 |

`getGraph` 要求每一行能还原完整 `placement`、`rendering` 和 `sites`，并合并为一个
`MaterialAggregate`。普通 Go backend `materials` 行虽然也位于 `/api/v1/materials`，
但当前并不保证这些聚合字段，因此不能把它冒充 `material.readGraph`。

OS 侧由 `unilab -g/--graph` 在启动时选择设备图。graph 文件只读一次，随后 OS 内部可继续
修改同一个 `ResourceTreeSet`；services 每次读取都通过 bridge 刷新这份当前内存态，
不会把文件或 bridge cache 当作第二事实源。

当前三种 Profile 都没有可声明的统一物料写能力。不得在 adapter 内依次调用 material、
relative-position 和 site 的行级 CRUD 来伪装一个原子命令；在 revision、幂等、失败补偿
和 edge/backend 一致性没有统一前，UI 必须明确显示只读/不可用。

OS 与 Go backend 的逐路由、字段和调用链对照记录在 Uni-Lab-OS：
`unilabos/app/local_bridge/MATERIAL_API.md`。

## 工作流端口

`src/workflow.ts` 的 `WorkflowRuntimePort` 是前端工作流唯一契约：

| 能力 | 方法 | v1 接口 |
|---|---|---|
| 读图 | `getWorkflow` | `GET /api/v1/workflows/{id}/graph` |
| 保存 | `saveWorkflow` | `PUT /api/v1/workflows/{id}/graph` |
| 校验 | `validateWorkflow` | `POST /api/v1/workflows:validate` |
| Python → Canonical | `compilePythonWorkflow` | `POST /api/v1/authoring/compile` |
| Canonical → Python | `generatePythonWorkflow` | `POST /api/v1/authoring/generate-python` |
| 候选校验 | `validateAuthoringCandidate` | `POST /api/v1/authoring/validate` |
| 创建整图运行 | `createRun` | `POST /api/v1/runtime/runs` |
| 运行投影 | `getRun` | `GET /api/v1/runtime/runs/{run_id}` |
| 节点投影 | `listRunNodes` | `GET /api/v1/runtime/runs/{run_id}/nodes` |
| 事件补拉 | `listRunEvents` | `GET /api/v1/runtime/runs/{run_id}/events` |
| 调试命令 | `command` | `POST /api/v1/runtime/runs/{run_id}/commands` |
| 取消 | `cancelRun` | `POST /api/v1/runtime/runs/{run_id}/cancel` |
| 实时事件 | `subscribeRunEvents` | `WS /api/v1/runtime/events` |

`subscribeRunEvents` 以 `seq` 为游标。WebSocket 不可用或断开后，会从最后游标轮询
REST；调用方仍要按 `seq` 处理幂等更新。

## Backend adapter 约束

`BackendConfig` 可以选择 `backend` 或 `edge`，但二者的 UI 级协议都必须是
`unilab/v1`。部署差异只允许出现在 HTTP、认证、base URL 和 adapter 映射中：

- 组件不得根据 backend id 分支请求。
- 不得为 local OS 与 backend 复制 `WorkflowRun`、`WorkflowRunNode` 或命令枚举。
- 旧 `/api/run`、`/api/runtime/local/*` 不得暴露给新组件。Cloud panel
  `/ws/workflow/{uuid}` 已删除，禁止重新增加 adapter。
- adapter 可解包外层 `data`，但不能改变 Canonical revision 或运行语义。

## 运行与错误语义

- `createRun` 的 source 必须是完整 `workflow_revision_v2`。
- `start_node_id`、`breakpoints`、`pause_on_start` 放在 `debug`，不修改 source。
- 命令响应仅表示命令已接受；随后通过 run/event 投影确认状态。
- HTTP/WS 传输成功不等于执行成功。
- `dispatch_unknown`、`reconciling` 和结构化 problem detail 必须原样保留给 UI。
- service 被销毁时必须调用 `dispose()` 关闭 WS 和轮询。

## 适配器绝对不能做

- 不得让组件知道 `local-go`、`local-python` 或 cloud 名称。
- 不得仅凭 HTTP 200、相似路径或可解包 JSON 声明 capability。
- 不得静默补造 placement、Site、模型尺寸或 revision。
- 不得把 `well`/`tip-spot` 兼容项升级为长期领域 `Site`。
- 不得把高频 joint pose 混入 Material Graph 查询缓存。

## 修改检查

```bash
pnpm --filter @unilab/services typecheck
pnpm --filter @unilab/services test
pnpm --filter @unilab/workflow-editor typecheck
pnpm test:e2e:workflow
pnpm test:e2e:materials
```

新增接口时先扩充 port 和契约测试，再接组件。不要在组件里先写临时 `fetch`。
