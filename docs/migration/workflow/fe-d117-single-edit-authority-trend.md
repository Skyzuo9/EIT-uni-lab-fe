# Round FE-D117：单编辑权与真实 FE–OS 联调趋势报告

日期：2026-08-01

实现分支：`migration/fe-d117-single-edit-authority`

Frontend 固定点：`0b800ef2524f701d4c884c660eb788ea021f32e8`

通过完整门禁的 production/test 候选：
`96654c55e9c9396db3af873489aad22dc93d1a11`

最终 OS 联调基线：
`integration/workflow-task-runtime@92f71a14bad8e00b1d8d64136cbd1153d1041395`

跨仓工作状态：`Uni-Lab-OS/Uni-Lab-Core#139`（D-117）。

规范来源：OS 仓库
`docs/developer_guide/workflow_task_runtime_migration/fe_os_interaction_migration_matrix.md`。
本文只是前端 owning repo 的实现、测试和趋势证据，不重定义 Core 合同，也不把本地
worktree 当成跨仓权威。

## 1. 结论

FE-D117 已达到本地 non-squash 合并门：

- 一个 Workflow 会话同一时刻只有一种可写表示；代码模式下 Python 可写、画布只读，
  画布模式下画布缓冲可写、Python 是 OS 生成的只读投影；
- 多个 Workflow 可以同时打开、修改或运行，各自的模式、dirty buffer、CAS token 和
  保存目标隔离；
- 持久 Authoring 只使用 Workflow-scoped aggregate、Draft 双 CAS、单一
  `candidate_hash` Apply 和全局 SSE 失效通知；
- 冲突保留完整本地编辑，补读远端 aggregate，展示完整 diff，再用新 CAS token 重试，
  不提供 force overwrite；
- Candidate 与 Applied Graph 明确分开展示；无有效 Candidate 或 Draft invalid 时仍可看见
  Applied fallback 和结构化诊断；
- 浏览器真实 E2E 使用 production OS、SQLite、compiler 和 SSE，没有 FE route mock，
  没有第二个 OS 进程争抢 workspace lease；
- 本轮未修改 Backend，也没有引入 Backend 兼容层。

最终独立复审为 `0 Blocking / 1 Non-blocking`，允许合并。唯一 NB 是
`PersistentWorkflowAuthoringPanel` 体量较大，属于维护性重构，不影响 D-117 合同、正确性
或本轮合并。

## 2. 交付内容

### 2.1 FE service 边界

- 严格解析 `{code: 0, data: ...}`，不接受裸对象成功 fallback；
- 实现 Workflow-scoped GET、Draft PUT、Apply 及 `/api/v1/events` SSE；
- Draft PUT 精确携带 `python_source`、`expected_draft_hash`、
  `expected_workflow_revision`；
- Apply 精确携带一个 server-issued `candidate_hash`，不回传 Candidate；
- SSE 按 Workflow UUID 过滤，支持 `Last-Event-ID`，先按 event ID 去重，再由会话按完整
  aggregate version tuple 去重；
- 诊断类型与 OS wire 对齐为嵌套
  `source_range.{start_line,start_column,end_line,end_column}`。

### 2.2 编辑器与 Kernel 组合

- 新增持久 Authoring Panel，并通过显式 `workflow_uuid` 绑定到工作台 panel config；
- dirty、mode、冲突和 projection 状态按 Workflow 会话隔离；
- initial GET、write 和 SSE rehydrate 经同一 operation queue 串行；
- self-SSE 即使先于 write response 排队，也会在补读后按 aggregate tuple 丢弃，避免把
  自己的保存误判成远端冲突；
- 画布位置拖动不伪装成持久 Graph 编辑；本轮可写画布操作是 Python 可表达的节点重命名；
- 画布保存先生成完整规范化 Python、展示完整 diff，用户确认后才 Draft PUT；
- 窄分屏按 panel container 宽度切成上下布局，并为绝对定位 DAG 提供相对定位 stage，
  避免节点编辑器覆盖画布。

### 2.3 真实联调

真实 OS E2E 覆盖：

1. GET → Draft PUT → SSE → GET → Apply → GET；
2. 外部 Draft 修改产生 Authoring SSE；
3. Candidate Graph 经 `generate-python` 后保持可持久 round trip；
4. 两个 Workflow panel 的 mode、dirty 和保存目标互不干扰；
5. 浏览器完整执行代码/画布切换、冲突处理、画布保存、Apply 和 invalid Draft 诊断。

测试只根据浏览器请求完成和 UI 状态观察写入结果；不在 OS 持有文件 lease 时直接打开
Draft 文件轮询，避免测试观察动作本身制造 409。

## 3. 测试与评审证据

| 门禁 | 结果 |
|---|---:|
| 全仓 FE Vitest | 152 passed |
| Material | 54 passed |
| Pascal Lab Plugin | 13 passed |
| Services | 27 passed |
| Workflow Editor | 43 passed |
| Kernel Web | 15 passed |
| Desktop icon check | passed |
| Workspace typecheck | 12/13 个有脚本的项目全部通过 |
| Web production build | passed |
| Desktop production build | passed |
| 真实 production OS Playwright | 5 passed |
| 窄分屏与完整交互稳定性重复 | 6 passed（两项各重复 3 次） |
| `git diff --check` | passed |
| 独立最终复审 | Standards/Spec 合计 0B/1NB |

构建中仍有既有的 Sass legacy API、依赖包 `use client`、sourcemap 和大 chunk 警告；它们
没有导致门禁失败，也不是本轮引入的 Authoring 合同问题。

测试由独立 test subagent 先提交 RED 合同和真实 E2E，提交序列为 `1cfbd43`、
`836c9f6`、`eae0280`；实现完成后由唯一独立 review subagent 按 Standards 与 D-117 Spec
双轴复审。初次复审的 `6B/2NB` 已收敛为最终 `0B/1NB`。

## 4. 规模

相对 Frontend 固定点、截至 production/test 候选 `96654c5`：

| 分类 | 文件数 | 新增 | 删除 | 净增 |
|---|---:|---:|---:|---:|
| Production 实现 | 17 | 1,970 | 21 | 1,949 |
| Tests / E2E | 8 | 1,571 | 2 | 1,569 |
| 设计文档 | 1 | 118 | 0 | 118 |
| 其他（命令入口） | 1 | 1 | 0 | 1 |
| 合计 | 27 | 3,660 | 23 | 3,637 |

本趋势报告不计入上述候选规模。Production 统计不包含测试、E2E、文档和 `package.json`。

## 5. 问题趋势

本轮不是在持续扩张未知设计问题，而是在真实边界上逐步缩小问题集合：

- 初次独立复审发现 6 个 blocking；经过修复后降至 0；
- 真实浏览器联调暴露两个 production 缺陷：窄 panel 中 DAG 被覆盖、write response 前到达的
  self-SSE 造成假冲突；均已增加回归测试并关闭；
- 联调还发现一个 test-harness 并发假象：直接读 Draft 文件会触发 OS 的 fail-closed lease
  保护；改为从浏览器请求和 UI 观察后关闭；
- 最终复审发现 OS 诊断位置是嵌套 `source_range`，已按真实 wire shape 先补 RED 测试，
  再统一两个 FE 格式化入口；
- 最终只剩一个 Large Component 维护性 NB，不影响行为或合同。

因此问题正在变少，而且已从合同/正确性问题收敛到局部可维护性问题。

## 6. 策略调整

后续 FE–OS 切片采用以下调整：

1. 保留 production OS、SQLite、compiler、SSE 的真实 E2E，不用 route mock 替代联调；
2. SSE 同时做 event ID 去重和补读后的 aggregate version 去重；
3. 多 panel 响应式布局依据 container 而不是 viewport；
4. OS 文件 lease 存在时，E2E 通过 HTTP/UI 观察写入，避免直接文件轮询成为并发参与者；
5. wire DTO 测试直接使用 OS 的真实 snake_case 嵌套结构，避免 TypeScript 近似模型漂移；
6. `PersistentWorkflowAuthoringPanel` 的 controller/hook/dialog 拆分放入独立无行为变更的
   refactor round，不在 D-117 合并前扩大修改面；
7. 后续 Runtime/Task/Debugger 迁移继续以最新 FE–OS migration matrix 为切片地图，
   Core Issue/Feishu revision 为跨仓权威，本仓文档只记录 owning repo 实现。

## 7. 合并与外部状态

production/test 候选 `96654c5` 已通过全部门禁和最终复审，可 non-squash 合入本地 FE
integration 分支。合并后应在 Core #139 记录 FE 候选、FE merge、OS 联调基线和测试证据。

本轮不 push。由于远端分支、CI 和 Core submodule pin 尚未发布，Core #139 应保持 open，
不得把本地合并误标为 `stage:accepted`。
