# @unilab/pascal-host

React host boundary for the upstream
[`pascalorg/editor`](https://github.com/pascalorg/editor).

The upstream editor stays an external, pinned dependency. Uni-Lab-specific
behavior belongs in `@unilab/pascal-lab-plugin`; it must not be patched into a
vendored Pascal source tree.

The host currently validates `@pascal-app/core`, `@pascal-app/editor` and
`@pascal-app/viewer` at `0.9.2`. It is client-only and is loaded lazily by
`kernel-web`. The Vite application supplies small `next/image` and `next/link`
compatibility components for the upstream imports; this package does not require
Next or server-side rendering.
