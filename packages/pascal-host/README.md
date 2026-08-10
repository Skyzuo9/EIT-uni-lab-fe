# @unilab/pascal-host

React host boundary for the upstream
[`pascalorg/editor`](https://github.com/pascalorg/editor).

The upstream editor stays an external, pinned dependency. Uni-Lab-specific
behavior belongs in `@unilab/pascal-lab-plugin`; it must not be patched into a
vendored Pascal source tree.

The host currently validates `@pascal-app/core`, `@pascal-app/editor` and
`@pascal-app/viewer` at `0.9.2`. It is client-only and is loaded lazily by
`kernel-web`, the desktop shell, and the Theia workbench. This package supplies
small shared `next/image` and `next/link` compatibility components for the
upstream imports; this package does not require Next or server-side rendering.

## Scene 保真边界

host 只负责安装 upstream editor/viewer 和 Uni-Lab plugin。Pascal 原生 scene、网格、
灯光、控制器与 view-mode 组件应原样保留；实验室模型必须放在网格之上，而不是用额外
overlay 覆盖网格。相机 framing 必须依据所有可见对象的 bounds 通用计算，禁止对设备名、
测试文件名或 `plr_test` 写特例。

升级 Pascal 时先更新固定版本并运行 host/plugin/desktop 验证。不要直接修改
`node_modules`、复制 upstream 源码或维护私有 fork 来解决可由 adapter 完成的问题。
