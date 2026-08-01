# Round UI1E：持久 Authoring 文件导入入口

日期：2026-08-01

实现分支：`integration/fe-os-migration`

Frontend 基线：`e2a09aff14c4676bb610ec59f87e147b1ba2d595`

决策来源：`Uni-Lab-OS/Uni-Lab-Core#139`（D-117 单编辑权）以及
`Uni-Lab-OS/uni-lab-fe#11`。

## 1. 目标

在唯一生产入口 `PersistentWorkflowAuthoringPanel` 中恢复 Kernel 工作台原有的
“导入 Python”和“导入 JSON”入口，同时保持 D-117 的 Draft → Candidate → Apply
权威链路：

- 继续复用 `useWorkflowFileUpload` 的 Electron、File System Access API 与隐藏
  `<input type=file>` 三层文件选择实现；
- `.py` 导入到当前 Workflow 的代码模式，作为未保存 Python Draft；
- `.json` 只接受当前持久 Authoring 的 `WorkflowAuthoringGraph`、含 `graph` 的导出，
  或含 `candidate.graph` / `applied_graph` 的 Authoring aggregate 导出；
- JSON 导入进入画布模式，由 OS `POST /api/v1/authoring/generate-python` 生成完整
  Python 投影；保存时仍展示完整 Python diff，用户接受后才写 Draft；
- 两种导入最终都只使用现有 Draft PUT 双 CAS 和 single-token Apply。

## 2. 停止线

- 不恢复旧 `WorkflowToolbar` 作为第二个生产工作台，只复用文件选择 hook、按钮语义和
  现有样式。
- 不恢复 `saveWorkflow`、旧 Run、Runtime WebSocket、polling 或临时 DAG 执行。
- 不把 Canonical v2 或旧 Cloud JSON 在浏览器中猜测转换成 Backend-shaped
  `WorkflowAuthoringGraph`。当前 OS 持久 Authoring 没有这条 conversion contract；
  此类文件必须 fail closed 并给出可行动错误，后续若要兼容需先冻结 OS conversion
  Interface。
- JSON 中的 `workflow.uuid` 必须等于当前 panel 的 `workflowUuid`；导入不能隐式切换
  Authority 或覆盖另一个 Workflow。
- 当前表示 dirty、Authoring aggregate 未加载或操作执行中时禁用导入，防止静默丢失。

## 3. 公开测试 seam

1. **浏览器 seam**：用户能看到并操作“导入 Python”“导入 JSON”，导入后通过原
   CodeEditor、DAG、完整 diff、保存草稿和应用工作流观察结果。
2. **HTTP seam**：所有业务请求仍通过 `WorkflowRuntimePort`；E2E 记录真实 OS 请求，
   断言 Python 导入走 Draft PUT，JSON 导入走 generate-python → Draft PUT，Apply 只含
   `candidate_hash`。

不测试组件私有 state、FileReader 内部实现或 OS 数据库。

## 4. TDD 切片

1. RED：真实浏览器找不到“导入 Python”；GREEN：复用文件选择 hook，把 Python 文件
   放入代码模式并标记 dirty，保存后得到 server-owned Candidate。
2. RED：真实浏览器找不到可工作的“导入 JSON”；GREEN：严格解析同 Workflow 的
   Authoring Graph，调用 OS generate-python，进入画布 dirty 状态，完整 diff 接受前不
   写 Draft。
3. RED：Canonical/Cloud/mismatched Workflow JSON 未 fail closed；GREEN：保留当前
   内容并显示结构化可行动错误。
4. 收口：真实 OS E2E 生成至少 6 张截图和网络账本，再执行 package/full gates。

## 5. 验收

- 原设备、DAG、CodeMirror、Debugger、Output 与 Task controller UI 不重写；
- Python/JSON 导入各自完成保存草稿和应用工作流；
- JSON 完整 diff 接受前 Draft PUT 数量不增加；
- Apply body 恰好只有 `candidate_hash`；
- `console.error`、`pageerror`、旧 Run/WS/轮询请求均为 0；
- 更新 `fe_os_interaction_migration_matrix.md`、FE delivery Issue 和 Core Wayfinder。
