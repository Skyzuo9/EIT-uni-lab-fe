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

桌面端连接栏可选择设备图 JSON、Uni-Lab-OS 项目目录和 OPC 仿真项目目录，
并以一个受控会话启动或停止 Edge 与仿真器。关闭“同时启动 OPC 仿真器”后，
仿真项目目录不再必填，Edge 会直接使用设备图中配置的 OPC 服务。

仿真项目需要提供根目录 `start.sh`（Windows 为 `start.bat`），或提供
`unilab-launch.json`：

```json
{
  "command": ".venv/bin/python",
  "args": ["main.py"],
  "readyPort": 4840
}
```

`command`、可选 `cwd` 中的路径必须位于所选仿真项目目录内。就绪条件必须使用
`readyPort` 或 `readyUrl`；没有显式就绪条件的标准启动脚本只检查进程是否持续运行。
所有命令均以参数数组直接启动，不经过 renderer 或任意 shell 字符串拼接。

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
