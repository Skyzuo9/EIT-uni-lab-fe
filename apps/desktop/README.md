# Desktop

`@unilab/desktop` 是 `@unilab/kernel-web` 的 Electron 打包层。它提供桌面窗口、受控的
系统能力和安装包，不拥有另一套页面或业务状态。

## 文件导航

- `src/main/`：Electron 主进程、窗口生命周期和认证窗口。
- `src/preload/`：最小化、类型化的 renderer bridge。
- renderer 内容直接来自 `@unilab/kernel-web`。

## 原则

- Web 与 desktop 使用相同的组件、路由、services 和 store。
- Node/Electron 能力只通过 preload 暴露窄接口；renderer 不启用任意 Node 权限。
- 本地 OS 连接仍走 Services Profile，不在主进程实现第二套物料或工作流 client。
- 桌面环境差异应限制在窗口、文件选择、协议唤起等宿主能力。
- 本地 `dev`/`preview` 使用 `build/icon.png` 作为窗口图标，并在 macOS 显式设置
  Dock 图标；安装包继续使用 `electron-builder.yml` 声明的 `icon.icns/icon.png`。

## 本地环境启动

桌面端连接栏可选择以下路径，并以一个受控会话按顺序启动或停止本地调试环境：

- `unilab` Conda 环境目录（自动识别本机兼容环境，也可手动选择；内部使用
  `bin/python` 与 `bin/unilab`）
- Uni-Lab-OS 项目根目录
- Uni-Lab-SZLab 项目根目录
- SZLab 设备图 JSON
- PLC-Sim 项目根目录（可选，内部使用 `OpcUaSim/gui/backend.py`）

启动顺序与固定端口如下：

1. OPC UA：`python -m gui.backend`，监听 `127.0.0.1:18765`。
2. SZLab Edge 内部服务：`deployment/local_bridge_entrypoint.py`，API 监听 `8014`，Schedule
   WebSocket 监听 `8892`，连接 Edge `18003`。
3. SZLab Edge：使用 ROS backend、`ROS_DOMAIN_ID=42`，HTTP 监听 `18003`。
   每次启动会在 `runtime/ideawit-e2e` 下生成独立的
   `edge-runtime-YYYYMMDD-HHMMSS.sqlite3`，并通过 `UNILABOS_RUNTIME_DB`
   传给 Edge。

启用本地 OPC UA 时，步骤 2 和步骤 3 必须等待 `18765` 确认就绪后再执行，
PLC-Sim 与 SZLab Edge 不并行启动。

产品界面仅展示 OPC UA 与 SZLab Edge；内部服务随 SZLab Edge 一起启动和停止，
不作为独立服务暴露给用户。

启动前会校验项目结构、可执行文件和端口占用；任一进程启动失败或意外退出时，
其余进程会被统一回收。所有命令均以参数数组直接启动，不经过 renderer 或任意
shell 字符串拼接。日志分别写入 `simulator.log`、`bridge.log` 和 `edge.log`。

## 绝对不能做

- 不得复制 `kernel-web` 页面形成第二套 renderer。
- 不得在主进程保存 Material Graph 或工作流运行权威状态。
- 不得绕过 Services capability matrix 调用本地端口。
- 不得把测试专用路径、模型或相机参数写入生产启动逻辑。

## 验证

```bash
pnpm --filter @unilab/desktop typecheck
pnpm --filter @unilab/desktop build
pnpm --filter @unilab/desktop dev
```

涉及桌面集成的变更必须至少手工验证 Profile 切换、2D/2.5D/3D/split 与窗口重载。
