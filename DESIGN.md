---
name: "Uni-Lab"
description: "面向实验室自动化操作、编排与调试的精密工作台设计系统"
colors:
  control-blue: "#2563eb"
  instrument-teal: "#0f766e"
  material-purple: "#7c3aed"
  scene-indigo: "#4f46e5"
  success-green: "#16a34a"
  warning-amber: "#d97706"
  danger-red: "#dc2626"
  workspace: "#f4f7fb"
  canvas: "#f1f5fa"
  surface: "#ffffff"
  surface-muted: "#edf2f7"
  border: "#dde5ee"
  border-strong: "#c9d4e1"
  ink: "#1f2329"
  ink-muted: "#6b7280"
  focus-blue: "#93c5fd"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  section:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
  data:
    fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  sm: "4px"
  control: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-6: "24px"
  space-8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.instrument-teal}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  button-danger:
    backgroundColor: "#fef2f2"
    textColor: "{colors.danger-red}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "38px"
  status-success:
    backgroundColor: "#f0fdf4"
    textColor: "{colors.success-green}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "5px 8px"
  control-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.space-4}"
---

# Design System: Uni-Lab

## Overview

**Creative North Star: "精密仪器台（The Precision Instrument Bench）"**

Uni-Lab 的界面应像一张维护良好、校准清楚的精密仪器台：每个控制都有明确边界，每项读数都能快速定位，每种状态都可被验证。视觉表达服务于操作确定性，以紧凑但不拥挤的密度、稳定的空间关系和低噪声表面承载复杂实验信息。

整体气质是冷静、精密、可信。品牌存在于细节的一致性中，而不是装饰性展示中。模块色用于建立方向感，语义色用于表达运行状态；阴影、动效和强调色都必须说明层级或交互，不能仅用于制造视觉刺激。

**Key Characteristics:**

- 清晰、可扫描的状态层级
- 克制的冷色工作区与白色操作表面
- 面向数值、坐标和设备标识的等宽数据语言
- 紧凑、明确、可预测的控制反馈
- 桌面高密度优先，同时保留可靠的移动降级

## Colors

配色以冷灰工作区为底，以控制蓝维持全局交互一致性，并用模块色区分设备、物料和场景；成功、警告与危险色只承担稳定的语义职责。

### Primary

- **控制蓝（Control Blue）**：全局主要交互、工作流与暂停状态。它用于跨模块共享动作，不取代模块自己的身份色。
- **仪器青（Instrument Teal）**：仪器设备模块的选择、主要动作、图标和实时控制反馈。

### Secondary

- **物料紫（Material Purple）**：物料模块的选择、高亮和身份表达。
- **场景靛（Scene Indigo）**：3D 场景模块的导航和视图身份表达。

### Tertiary

- **运行绿（Success Green）**：已经由权威状态确认的成功、在线或健康状态。
- **告警琥珀（Warning Amber）**：需要注意、调试运行、模拟或尚未接入真实设备的状态。
- **故障红（Danger Red）**：失败、异常、断点和危险操作。

### Neutral

- **工作区冷灰（Workspace）**：应用主背景，降低长时间操作的视觉疲劳。
- **场景画布（Canvas）**：流程图、空间视图和可视化画布。
- **仪器白（Surface）**：卡片、控制组、输入区域和高优先级信息表面。
- **结构灰（Border / Border Strong）**：分隔区域、定义输入和控制边界；强边框只用于可操作或选中对象。
- **主墨色与次墨色（Ink / Ink Muted）**：正文与辅助信息。弱化文字不能承载关键状态或主要操作。

**The Semantic Color Rule.** 绿色只表示已确认成功或在线，蓝色不表示运行中，橙色表示运行或等待注意，紫色表示起始点或物料身份，红色表示断点、异常或危险。

**The Color Is Corroboration Rule.** 任何状态都必须同时具有文字、图标、结构或可访问标签；颜色永远不是唯一证据。

## Typography

**Display Font:** 系统无衬线字体栈  
**Body Font:** 系统无衬线字体栈  
**Label/Mono Font:** JetBrains Mono 优先的等宽字体栈

**Character:** 无衬线字体保证中文、英文和系统控件在不同平台上的清晰度；等宽字体把设备地址、坐标、关节值、时间、文件路径和代码内容组织成可比较的数据列。界面不使用独立的营销展示字体。

### Hierarchy

- **Title**：页面内设备、工作流或主要对象的身份标题；短、明确，不承担宣传语。
- **Section**：控制组、状态面板和参数区的标题。
- **Body**：操作说明、诊断和上下文信息；较长文本应控制在易读行宽内。
- **Control**：按钮、导航和关键交互标签；使用中等以上字重保证快速识别。
- **Label**：字段名、状态名和辅助元数据。
- **Data**：设备型号、IP、数值、坐标、时间、路径和代码；使用等宽字体和表格数字。

**The Data Has a Voice Rule.** 只要内容需要逐位比较、复制或诊断，就使用 Data 角色；普通说明文字不得为了“技术感”滥用等宽字体。

**The No Hero Type Rule.** 操作型界面不使用超大标题、极端字距或营销式断句占用工作空间。

## Layout

应用采用固定顶栏、模块导航和可伸缩主工作区。桌面端左侧导航保持窄而稳定，模块内部使用列表—详情、分栏工作台或画布结构；信息层级通过对齐、间距和边界建立，而不是重复嵌套卡片。

间距遵循基于 4px 的既有尺度。紧密相关的标签与数值使用较小间距，组件内部使用中等间距，模块和主要区域之间使用较大间距。桌面控制面板优先在单个视口内展示关键状态和操作；次要信息可以滚动，但不得让急停、暂停、运行反馈或主要诊断离开操作上下文。

在 1000px 以下，多列设备控制区收敛为单列；在 720px 以下，主导航移动到底部，模块内容改为纵向结构；在 600px 以下，状态指标、点动控制和动作按钮减少列数。响应式变化应重排信息而不是水平压缩到不可读。

**The Stable Instrument Position Rule.** 高频更新的读数不得改变周围布局；为数值预留稳定宽度，并使用表格数字或等宽字体。

**The One Workspace Rule.** 不为不同部署、桌面外壳或移动宽度复制第二套页面结构；同一界面通过组合和响应式规则适配。

## Elevation & Depth

系统采用结构化分层。常态表面通过背景色、边框和空间间隔区分；阴影只用于确实位于其他内容之上的抽屉、浮层、弹出控件、拖拽反馈或明确选中状态。卡片在静止状态下保持平整，避免把每个信息组都处理成悬浮对象。

### Shadow Vocabulary

- **Panel Lift** (`0 12px 32px rgb(15 23 42 / 12%)`)：抽屉、浮层和需要脱离工作区的临时面板。
- **Control Lift** (`0 1px 3px rgb(15 23 42 / 10%)`)：分段控件的当前选项和轻量交互层。
- **Selected Ring** (`0 0 0 2px #334155`)：需要强结构确认的选中对象，不替代焦点环。

**The Flat-at-Rest Rule.** 静止的工作区、卡片和控制组默认无阴影；浮起必须对应真实层级或状态变化。

## Shapes

形状语言来自精密工具而非消费娱乐产品。小型控件使用轻微圆角，中型按钮与输入保持柔和但清晰的矩形轮廓，卡片和主要控制组使用较大圆角。胶囊形只用于状态标记和短标签，不用于普通按钮、卡片或输入框。

边框是主要结构工具：默认边框用于区域分隔，强边框用于可交互对象，焦点状态使用独立的高可见度外环。图标以细线几何为主，尺寸与笔画在同一上下文中保持一致。

**The Radius Has Hierarchy Rule.** 圆角随容器层级增加，但不能把所有元素都变成胶囊；状态是胶囊，控制是矩形，容器是柔和面板。

## Components

### Buttons

- **Shape:** 精确、紧凑的矩形控制，主要动作和危险动作保持相同尺寸体系。
- **Primary:** 使用当前模块身份色；设备模块的主要动作采用仪器青和白色文字。
- **Hover / Focus:** hover 只做轻微色调变化；键盘焦点始终使用清晰的焦点环。按压可有轻微位移，但不能影响邻近布局。
- **Secondary / Ghost:** 白色或透明表面配结构边框；不与主要动作争夺视觉优先级。
- **Danger:** 默认使用浅红背景与红色文字；只有危险状态已经激活时才使用实心红色。

### Chips

- **Style:** 胶囊形仅用于在线、模拟、告警和运行状态；背景使用对应语义色的低强度色阶。
- **State:** 必须包含文字，状态点只能作为辅助；短标签不得承载复杂诊断。

### Cards / Containers

- **Corner Style:** 使用大圆角形成稳定控制区域。
- **Background:** 以仪器白为主要表面，工作区冷灰作为页面底色。
- **Shadow Strategy:** 静止状态依靠边框和色调分层，遵循 Flat-at-Rest Rule。
- **Border:** 使用结构灰；嵌套区域优先通过间距或轻背景区分，避免层层边框。
- **Internal Padding:** 默认采用中等间距，数据密集型单元可收紧但不能牺牲触控或可读性。

### Inputs / Fields

- **Style:** 白色背景、强结构边框、中等圆角；设备参数和路径使用 Data 字体角色。
- **Focus:** 显示焦点蓝外环并保持原边框可见。
- **Error / Disabled:** 错误同时提供文字说明；禁用状态降低强调并移除指针暗示，但仍须保持文字可读。

### Navigation

桌面端采用窄左侧模块导航，图标与短标签垂直排列；移动端变为底部导航。默认状态使用次墨色，hover 使用模块浅色，active 使用模块身份色、浅色背景和边缘标记，并通过 `aria-current` 表达当前位置。

### Segmented Controls

分段控件位于浅灰轨道内，当前项使用白色表面、模块身份色与轻量控制阴影。它适合数量少且互斥的模式切换，不替代导航或多选控件。

### Telemetry and Status Strips

遥测值以固定网格、等宽数字和稳定标签呈现。状态条必须在一次扫视中回答“当前模式、设备状态、活动对象和关键限制”；高频更新不得产生闪烁、跳位或不必要动画。

## Do's and Don'ts

### Do:

- **Do** 使用单一、稳定的视觉层级，让身份、状态、控制和反馈在固定位置出现。
- **Do** 使用现有模块身份色和语义色，不为单个页面创建新的近似色。
- **Do** 使用文字、图标与结构共同表达运行状态，并维持 WCAG 2.1 AA。
- **Do** 为设备数值、坐标、时间和路径使用等宽字体、表格数字与稳定宽度。
- **Do** 在响应式布局中重排控制和状态，保留核心操作的上下文关系。
- **Do** 尊重 `prefers-reduced-motion`，让动效说明状态而不是制造装饰。

### Don't:

- **Don't** 使用玻璃拟态、霓虹赛博风、装饰性渐变或无层级意义的大面积阴影。
- **Don't** 把每个信息组都包装成悬浮卡片，也不要用卡片网格替代真正的信息架构。
- **Don't** 用绿色表示选中、蓝色表示运行中，或让同一种颜色在不同模块承担冲突语义。
- **Don't** 使用超大标题、极端字距、营销式短句或泛化的“现代科技”视觉语言。
- **Don't** 用仅 hover 可发现的入口承载关键操作，也不要把颜色作为状态的唯一证据。
- **Don't** 因局部需求复制第二套 token、组件或 renderer。
