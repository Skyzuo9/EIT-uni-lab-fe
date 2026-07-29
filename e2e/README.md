# 前端端到端测试

这里验证浏览器通过统一 v1 接口连接真实 local bridge/OS 的关键用户路径。测试不是
API mock 演示；工作流场景必须同时观察 UI、真实 HTTP/WS 调用和 OS 的权威投影。

## 工作流场景

- `workflow-runtime.spec.ts`：完整控制 DAG、校验/保存、调试启动、单步、继续、
  逐节点反馈，以及 JSON ↔ Python 编写往返。
- `workflow-debug-scenarios.spec.ts`：起始点、两个断点、连续单步、异常/终止等调试语义，
  并保存 API 快照和截图证据。
- `workflow-debug-actions.spec.ts`：自动拉起隔离的真实 offline local bridge，逐项覆盖
  暂停、单步、步过、步入、继续、终止、急停，并核对节点收敛、命令请求和区分后的
  `debug.terminate_requested` / `debug.emergency_stop_requested` 事件。
- `material-scene.spec.ts`：同时拉起真实 Registry internal server 与 offline
  local bridge，验证 Edge 模板目录、当前物料图、2D/2.5D/Pascal 3D/Split，以及
  Registry 断开后的 stale 只读降级。
- `material-create.spec.ts`：浏览器级完整 MaterialWorkbench 验收，覆盖 Cloud
  迁移后的左侧目录树、中央 ReactFlow、右侧模板入口，以及旧模板内容隔离、同
  MaterialScope 名称唯一性和合法创建命令。夹具只在测试端口内注入模板写能力，
  不会把尚未实现的服务能力伪装成生产 Profile 能力；真实 OS 集成仍由
  `material-scene.spec.ts` 验证。
- `lab-map-v2.spec.ts`：通过实验开关加载 Lab Map V2，核对真实物料图、地图结构层、
  设备库、新建/拖拽/旋转/删除草稿设备、选择/缩放交互，以及回切旧 2.5D 后的同 ID
  选择状态。

## 运行

先在 `unilab` Python 3.11 环境启动 OS local bridge，例如：

```bash
cd ../Uni-Lab-OS
UNILAB_PY=/home/changjunhan/.micromamba/envs/unilab/bin/python
"$UNILAB_PY" -m unilabos.app.local_bridge.server --offline
```

再从前端仓库运行：

```bash
UNILAB_OS_E2E_URL=http://127.0.0.1:8014 pnpm test:e2e:workflow
UNILAB_OS_E2E_URL=http://127.0.0.1:8014 pnpm test:e2e:workflow-debug
pnpm test:e2e:workflow-actions
pnpm test:e2e:material-create
UNILAB_OS_E2E_URL=http://127.0.0.1:8014 pnpm test:e2e:materials
pnpm test:e2e:lab-map-v2
```

七动作测试默认自己分配 loopback 端口，并以 `--offline-node-delay` 启动 OS bridge，
从而可确定性观察 running → pause_pending → paused。只有明确设置
`UNILAB_DEBUG_ACTIONS_E2E_URL` 时才复用外部测试 bridge；不要指向真实生产设备。

没有设置 `UNILAB_FE_E2E_URL` 时，Playwright 会构建并启动 `kernel-web` preview；
设置后则复用指定前端。产物写入相邻的 `../e2e-artifacts`。

## 证据要求

工作流调试用例至少断言：

- 下发的是包含控制节点的完整 Canonical v2 DAG。
- 起始点之前/不可达节点被置灰，并最终由 OS 报告 `skipped`。
- 断点命中时节点仍为 `pending`，UI 显示“暂停于节点之前”。
- `step` 每次只推进一个逻辑节点。
- 运行中为橙色、成功为绿色、暂停为蓝色，且都有文字状态。
- 事件 `seq` 单调、REST/WS 投影可核对。
- `console.error` 和 `pageerror` 为空。

禁止用 `page.route()` 伪造工作流运行成功，也禁止只凭截图判断执行语义。

物料场景至少要核对：

- 完整工作台保持左侧目录树、中央统一视图和右上模板入口；不可只截取创建弹窗当作
  Cloud 界面验收。
- `/api/v1/materials` 和 `/api/v1/material-models` 来自真实 OS local server。
- `/api/v1/resource-templates` 来自真实已构建 Registry：全量 summary、按需详情、
  device/resource 公开规则和稳定 ETag 可核对；不得使用浏览器 route mock。
- Registry 中断且已有缓存时显示 `stale` 并禁用创建；无缓存时必须明确失败。
- floorplan、孔板外形、孔径、孔距、行列数和内部偏移来自服务或模型数据。
- 2D、2.5D、3D、split 共享同一 material ID、选择、高亮与 tag。
- 2.5D 使用统一斜二测投影与真实高度排序，堆叠遮挡可见。
- 3D 保持 Pascal 原生 scene、灯光和位于模型下方的网格。
- 相机按通用 bounds 自适应，不出现测试模型名称、固定位置或固定缩放分支。
- OS 注册的 URDF/XACRO 及其 mesh 子资源都能通过安全 asset route 加载。
- 浏览器无 `console.error`、`pageerror`、模型 404 或越界资源请求。

`plr_test` 是覆盖复杂模型的验收样例，不是生产默认值来源。测试可以比较其参考图，但不得
把该图对应的 camera、尺寸、mesh 路径或 floorplan 写入应用代码。

Lab Map V2 用例会自行拉起相邻目录的真实 Uni-Lab-OS，并把总览、设备库、草稿排布、
选中态和旧 2.5D 回归截图写入 `../e2e-artifacts/lab-map-v2`。测试中的手动空间图只标识
实验室区域与固定结构，物料及其几何仍来自 OS 当前 Material Graph；新建设备保存在独立
的地图设计草稿中，不会伪造成 OS Material。
