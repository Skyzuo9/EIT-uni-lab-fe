# Lab PC Client

一个基于 Electron 的桌面应用外壳，主界面为左右分栏画布：左侧展示液体工作站设备配置 `liquid_handler.yaml`，右侧展示对应的物料（deck 耗材布局）界面，中间分隔条可拖拽调整比例。

## 技术栈

- 构建脚手架：[electron-vite](https://electron-vite.org/)（Vite 驱动，主进程 / 预加载 / 渲染进程三段式）
- 前端框架：React 18 + TypeScript
- 画布：纯 React 组件实现（YAML 只读高亮视图 + deck 物料布局，无额外可视化依赖）
- 打包工具：[electron-builder](https://www.electron.build/)

## 目录结构

```text
.
├── electron.vite.config.ts     # 主/预加载/渲染 三段构建配置
├── electron-builder.yml        # 打包配置（appId、mac target、图标等）
├── build                       # 打包资源
│   ├── icon.png                # 源图标（1024x1024）
│   └── icon.icns               # macOS 图标（由 icon.png 生成）
├── src
│   ├── main/index.ts           # 主进程：创建 BrowserWindow
│   ├── preload/index.ts        # 预加载：contextBridge 暴露安全 API
│   └── renderer                # 渲染进程（React 应用）
│       ├── index.html
│       └── src
│           ├── main.tsx        # React 入口
│           ├── App.tsx         # 应用外壳（标题栏 + 画布）
│           ├── components
│           │   ├── Workbench.tsx      # 左右分栏画布（可拖拽分隔条）
│           │   ├── YamlPanel.tsx      # 左侧：liquid_handler.yaml 只读高亮视图
│           │   ├── MaterialPanel.tsx  # 右侧：物料界面（deck 布局 + 试剂图例）
│           │   ├── DeckSlotCard.tsx   # deck 单个槽位卡片
│           │   └── LabwareGrid.tsx    # 物料孔位/枪头网格
│           ├── hooks/useResizableSplit.ts  # 分栏比例拖拽逻辑
│           ├── data/liquidHandler.ts  # 液体工作站配置数据 + YAML 序列化
│           └── styles/global.css
├── out/                        # electron-vite 构建产物（自动生成）
└── release/                    # electron-builder 打包产物（自动生成）
```

## 环境要求

- Node.js 18+（建议 20/22）
- macOS（当前打包目标为 macOS arm64）

## 安装

```bash
npm install
```

> 国内网络下 Electron 二进制默认从 GitHub 下载可能很慢，本项目已在 `.npmrc` 中配置 npmmirror 镜像。

## 开发

```bash
npm run dev
```

启动后 electron-vite 会同时构建主进程/预加载、拉起渲染进程 dev server（默认 `http://localhost:5173`）并打开应用窗口，支持热更新。

## 类型检查

```bash
npm run typecheck
```

## 打包（macOS）

```bash
npm run build:mac
```

流程：先 `electron-vite build` 产出 `out/`，再 `electron-builder --mac` 产出安装包。

产物路径：

- `release/Lab PC Client-<version>-arm64.dmg` — 可分发的安装镜像
- `release/mac-arm64/Lab PC Client.app` — 未压缩的应用包

> 本项目未做代码签名与公证（notarization），首次打开需在 Finder 中右键点击应用选择「打开」。

## 应用图标

图标源文件为 `build/icon.png`（1024x1024），macOS 使用由它生成的 `build/icon.icns`，并在 `electron-builder.yml` 中通过 `mac.icon` 引用。

如需替换图标，替换 `build/icon.png` 后重新生成 `.icns`：

```bash
ICONSET=build/icon.iconset
mkdir -p "$ICONSET"
for spec in "16:icon_16x16" "32:icon_16x16@2x" "32:icon_32x32" "64:icon_32x32@2x" \
  "128:icon_128x128" "256:icon_128x128@2x" "256:icon_256x256" "512:icon_256x256@2x" "512:icon_512x512"; do
  sz=${spec%%:*}; name=${spec##*:}
  sips -z "$sz" "$sz" build/icon.png --out "$ICONSET/$name.png"
done
cp build/icon.png "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o build/icon.icns
rm -rf "$ICONSET"
```

## 常见问题

- 若运行 `npm run dev` 或直接 `electron .` 时报 `Cannot read properties of undefined (reading 'isPackaged')`，通常是环境变量 `ELECTRON_RUN_AS_NODE=1` 使 Electron 以纯 Node 模式启动所致。取消该变量即可：

```bash
unset ELECTRON_RUN_AS_NODE
```

## 后续可扩展

- 增加 Windows / Linux 打包 target
- 接入真实业务的 `liquid_handler.yaml` 与物料数据（当前为内置示例）
- 支持 YAML 编辑与物料布局的双向联动
- 通过主进程 IPC 扩展文件读写、系统能力等
