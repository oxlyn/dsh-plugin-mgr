// client bundle 构建：src/client/main.js → dist/client.js（单文件 IIFE）。
//
// 结构：esbuild 把 ESM 模块树打成 `var __dshpmBundle = (() => {...})()`，
// footer 追加 ModuleLoader 的 load 调用——工厂把运行时 require 传给
// boot()，平台依赖（react / UI 原语）在运行期经 context.js 桥接解析，
// 因此打包时不需要任何 external 配置。
//
// 运行：node scripts/build-client.mjs（pnpm build 自动调用）。

import { build } from "esbuild";

await build({
    entryPoints: ["src/client/main.js"],
    outfile: "dist/client.js",
    bundle: true,
    format: "iife",
    globalName: "__dshpmBundle",
    target: "es2022",
    // 压缩关闭：保留可读性便于线上排查；体积不是该插件的瓶颈
    minify: false,
    logLevel: "info",
    footer: {
        js: 'window.__ModuleLoader__.load({ id: "dsh-plugin-mgr", factory: (require) => __dshpmBundle.boot(require) });',
    },
});
