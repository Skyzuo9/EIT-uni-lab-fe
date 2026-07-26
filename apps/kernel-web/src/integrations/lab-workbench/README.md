# Lab Workbench integration

本目录是实验室工作台的组合边界。它把 services、Material Store、工作流物料引用、
统一视口和 panel layout 接到一起，但不拥有这些模块的领域数据。

## 组合关系

```text
current Profile
  -> ServicesProvider / MaterialRuntimeProvider
  -> one MaterialAggregate
  -> MaterialWorkbench (2D / 2.5D)
  -> Pascal lab plugin (3D)
  -> workflow material references

LabInteractionProvider
  -> selectedMaterialId
  -> hoveredMaterialId
  -> highlightedMaterialIds
  -> active view mode
```

跨 panel 联动通过稳定 ID 和有类型的 action 完成：

1. panel 发出 `select`、`hover` 或 `highlight` 意图；
2. `LabInteractionProvider` 更新轻量交互状态；
3. 各 panel 以相同 ID 从各自领域 store/selectors 读取数据；
4. Profile 切换时，服务作用域与依赖它的查询一起重建，旧 Profile 数据不得串入新作用域。

不要把完整 `MaterialNode`、ReactFlow node、Three.js object 或工作流 node 复制到交互
store。跨 panel store 只保存 ID、模式和短生命周期 UI 意图。

## 文件导航

- `MaterialRuntimeProvider.tsx`：Material Graph 服务装配与生命周期。
- `LabInteractionProvider.tsx`：跨 panel 的选择、悬停和高亮。
- `UnifiedLabViewport.tsx`：2D、2.5D、3D、split 视图组合。
- `SceneWorkbench.tsx`：Pascal 场景接线。
- `panelLayouts.ts`：工作台布局定义。
- `panelAdapter.tsx`：panel registry 与渲染适配。
- `workflowMaterialRefs.ts`：工作流对物料稳定 ID 的引用。
- `materialScope.ts`：当前物料查询作用域。
- `interactionStore.ts`：交互状态实现。

## 约束

- 所有视图必须消费同一份规范化 Material Graph。
- 2D/2.5D/3D 只做投影；不得互相回写派生坐标。
- 设备常驻 tag 和物料 hover tag 使用同一选择语义。
- ReactFlow 不订阅高频关节流；关节状态只进入 3D 实时通道。
- `well` 与 `tip-spot` 不是长期领域 `Site`，不得在本层把兼容投影固化为新协议。
- Profile 功能可用性必须来自 Services capability matrix；不可用时明确降级。
