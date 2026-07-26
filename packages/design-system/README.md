# Design System

`@unilab/design-system` 是 Uni-Lab 视觉 token 和基础组件的唯一来源。业务 package
应组合这些原语实现当前 `uni-lab-fe` 画风，主题切换也必须通过语义 token 完成。

## 文件导航

- `src/theme.css`：颜色、间距、圆角、阴影和字体等语义 token。
- `src/SlideOverDrawer.tsx`：通用抽屉组件。
- `src/index.ts`：公共导出。

## 主题规则

- 组件使用 `surface`、`text`、`accent`、`border` 等语义角色，不绑定某个品牌色值。
- theme 是表现配置，不得改变能力、权限或领域状态。
- 业务状态颜色应先定义语义，再映射到主题 token。
- 新组件保持无后端、无 store、无路由依赖。

## 绝对不能做

- 不得在业务包各自维护第二套全局 token。
- 不得通过主题切换重建 Material Graph、工作流或服务 Profile。
- 不得让基础组件识别 material、workflow、site 等业务类型。

## 验证

```bash
pnpm --filter @unilab/design-system typecheck
```

视觉变更还要在 kernel-web 和 Electron 中分别检查默认主题与至少一个替代主题。
