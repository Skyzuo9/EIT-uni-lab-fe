# 物料 2D 几何与 OS 本地 3D 模型目录

状态：Implemented
日期：2026-07-26
单位：静态业务坐标统一为 mm、Z-up；Pascal 边界转换为 m、Y-up

本文固定当前 2D 台面、孔板、枪头盒的几何快照，以及 Uni-Lab-OS
启动时登记的本地 3D 模型。React Flow 和 Pascal 不各自保存尺寸；二者只消费
Material Aggregate 的 `config.rendering` 与 `sites`。

## 1. 2D 投影约定

- `rendering.footprintMm = [width, height]` 是台面或物料的物理平面外框。
- `site.poseInAnchor.positionMm = [x, y, z]` 是 Site 左下角相对 owning
  Material root 的位置，不是圆心。
- `site.sizeMm = [width, height, depth]` 是 Site 自身尺寸。
- 业务坐标 Y 向上；DOM/React Flow Y 向下，因此渲染时：

```text
left = site.x
top  = owner.height - site.y - site.height
```

- 当前 2D 比例为 `0.7 px/mm`。比例只属于视图，不能写回 Material domain。
- `placement.kind === "site"` 的节点位置为
  `Site.poseInAnchor × placement.offsetPose`，不能只使用 offset。

## 2. PRCXI 9320 台面

数据源是 Uni-Lab-OS 的 `prcxi_9320_with_res_test.json`。旧图中的
`PRCXI9300Container` T1…T16 只表示插槽壳，API 已将其归一为
`PRCXI_Deck.sites`，不会再生成 16 个虚假 Material。

| 项目 | 尺寸/坐标 |
|---|---|
| PRCXI 设备 2D 外框 | `562 × 394` |
| `PRCXI_Deck` | `542 × 374` |
| Deck 在设备外框中的位置 | `[10, 10, 0]` |
| 单个 T Site | `128 × 86 × 0` |
| Site capacity | `1` |
| 允许内容 | `plate`、`tip_rack`、`plates`、`tip_racks`、`tube_rack` |

16 个 Site 使用以下确定性坐标；坐标为各 Site 左下角：

| 行 | Site | X 坐标 | Y 坐标 |
|---|---|---:|---:|
| 1 | T1、T2、T3、T4 | `0, 138, 276, 414` | `288` |
| 2 | T5、T6、T7、T8 | `0, 138, 276, 414` | `192` |
| 3 | T9、T10、T11、T12 | `0, 138, 276, 414` | `96` |
| 4 | T13、T14、T15、T16 | `0, 138, 276, 414` | `0` |

列距为 `138`，行距为 `96`。T16 在 2D 中渲染为 Trash；其他已占用 Site
仍保留自身精确位置，但用所挂载的孔板/枪头盒覆盖插槽标签。

## 3. 96 孔板

| 项目 | 数值 |
|---|---|
| 外框 | `127.76 × 85.48 × 14.2` |
| Site 数量 | `12 × 8 = 96` |
| 单孔尺寸 | `8.2 × 8.2 × 38` |
| A1 左下角 | `[10.2, 70.05, 3]` |
| X/Y pitch | `9 / 9` |
| 单孔容量 | `2000 µL` |
| Site kind/shape | `well / circle` |

令列 `c ∈ [1, 12]`，行 `r ∈ [0, 7]` 分别对应 A…H，则全部孔位坐标为：

```text
x(c) = 10.2 + 9 × (c - 1)
y(r) = 70.05 - 9 × r
z    = 3
```

因此 A1 为 `[10.2, 70.05, 3]`，H12 为
`[109.2, 7.05, 3]`。`visual.state` 与 `fillFraction` 决定孔的填充外观；
空孔、已占用孔或液体比例不改变孔位几何。

## 4. 96 枪头盒

| 项目 | 数值 |
|---|---|
| 外框 | `122.4 × 82.6 × 20` |
| Site 数量 | `12 × 8 = 96` |
| 单个 tip spot | `5.112 × 5.112 × 1` |
| A1 左下角 | `[11.804, 71.704, 9.47]` |
| X/Y pitch | `9 / 9` |
| Site kind/shape | `tip-spot / circle` |
| 枪头 STL 尺寸 | 约 `8.995 × 8.836 × 95` |

全部 tip spot 坐标为：

```text
x(c) = 11.804 + 9 × (c - 1)
y(r) = 71.704 - 9 × r
z    = 9.47
```

`visual.state === "tip-present"` 的 Site 才生成枪头实例。Pascal 对单份
`tip.stl` 使用 `InstancedMesh` 绘制全部实例，避免 96 次模型请求与 96 个
独立 React renderer。

## 5. PLR/Opentrons 台面与示例放置

| 项目 | 数值 |
|---|---|
| Opentrons deck 平面 | `624.3 × 565.2` |
| SBS Site 平面 | `127.76 × 85.48` |
| tip rack 相对 deck | `[265, 0, 69]` |
| plate 相对 deck | `[0, 90.5, 69]` |

Opentrons 11 个 SBS Site 坐标来自随 OS 分发的
`opentrons_liquid_handler/macro_device.xacro` 固定关节，均为 `z = 70`：

```text
1  [63.85,  42.0]   2  [196.35,  42.0]   3  [328.85,  42.0]
4  [63.85, 132.5]   5  [196.35, 132.5]   6  [328.85, 132.5]
7  [63.85, 223.0]   8  [196.35, 223.0]   9  [328.85, 223.0]
10 [63.85, 313.5]  11  [196.35, 313.5]
```

## 6. OS 本地 3D 模型登记

Uni-Lab-OS 创建本地 Material API 时构造 `MaterialModelRegistry`。启动阶段会
校验模型根、5 个模型入口以及枪头实例入口；缺失文件会使启动失败，而不是让
前端收到一个稍后才失败的宿主机路径。

| key | 入口 | 格式 |
|---|---|---|
| `opentrons-liquid-handler` | `devices/opentrons_liquid_handler/macro_device.xacro` | Xacro |
| `arm-slider` | `devices/arm_slider/macro_device.xacro` | Xacro |
| `thermo-orbitor-rs2-hotel` | `devices/thermo_orbitor_rs2_hotel/macro_device.xacro` | Xacro |
| `tiprack-96-high` | `resources/tiprack_96_high/meshes/tiprack_96_high.stl` | STL |
| `plate-96-high` | `resources/plate_96_high/meshes/plate_96_high.stl` | STL |

枪头盒另登记
`resources/tip/meshes/tip.stl` 作为 `tip-present` Site 的实例模型。

前端只接收同源公开 URL：

```text
/api/v1/material-models
/api/v1/material-models/assets/{registered-relative-path}
```

资源处理器拒绝越出 `unilabos/device_mesh` 的路径。Electron `file://`
renderer 通过当前 OS Profile 的 API URL 解析这些相对地址；Xacro 引用的
YAML 与子 STL 继续走同一个受控资源前缀。

## 7. 验收不变量

- PRCXI 2D 必须是精确 4×4 台面；孔板和枪头盒必须各显示 96 个内部 Site。
- T1…T16 不能作为 Material 留在树中；占用关系必须进入 deck Site。
- React Flow 不消费关节流。
- `plr_test_converted` 必须同时显示酒店、完整导轨、Opentrons、机械臂、
  gripper、孔板、枪头盒和 96 个枪头实例。
- Electron 中所有 Xacro、YAML、设备 STL、物料 STL 请求必须返回 200，
  且不得出现 browser error 或 request failure。
