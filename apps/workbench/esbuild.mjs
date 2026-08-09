/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, mode, watch } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';

import esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';
import { fileURLToPath } from 'node:url';

const sharedShimPath = name => fileURLToPath(
    new URL(`../../packages/pascal-host/src/shims/${name}.tsx`, import.meta.url)
);

browserOptions.alias = {
    ...browserOptions.alias,
    'next/image': sharedShimPath('next-image'),
    'next/link': sharedShimPath('next-link'),
};
browserOptions.jsx = 'automatic';
// Theia emits an IIFE bundle, so native `import.meta.url` has no module URL.
// Pascal's Three.js KTX2 loader still constructs its fallback URLs eagerly;
// the actual transcoder path is configured separately, but the base must be
// valid while the module initializes.
browserOptions.define = {
    ...browserOptions.define,
    'import.meta.url': 'window.location.href',
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.NEXT_PUBLIC_ASSETS_CDN_URL': JSON.stringify(
        process.env.NEXT_PUBLIC_ASSETS_CDN_URL ?? ''
    ),
    'process.env': '{}',
};

browserOptions.plugins.unshift(
    sassPlugin({ filter: /\.module\.scss$/, type: 'local-css' }),
    sassPlugin({ filter: /\.scss$/, type: 'css' }),
);

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);


if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch(),
    ]);
} else {
    try {
        await browserContext.rebuild();
        await browserContext.dispose();
        await nodeContext.rebuild();
        await nodeContext.dispose();
    } catch {
        process.exit(1);
    }
}
