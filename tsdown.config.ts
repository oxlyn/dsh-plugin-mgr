import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    // host 侧：cordis 插件入口（Node ESM；peer deps 与依赖不参与打包）
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'node',
    sourcemap: false,
    dts: false,
    deps: { neverBundle: [/^@deepseek-ai\//, 'js-yaml', /^node:/] },
    // package.json exports 指向 dist/index.js（ESM 内容 + .js 扩展名）
    outExtensions: () => ({ js: '.js' }),
  },
  {
    // client 侧：浏览器脚本。保持 window.__ModuleLoader__.load(...) 的立即
    // 执行形态（IIFE 包裹对经典 <script> 与 module 均安全）；react 由
    // harness 加载器的 require() 在运行时提供，不参与打包。
    entry: ['src/client.tsx'],
    format: 'iife',
    platform: 'browser',
    sourcemap: false,
    minify: false,
    // 固定产物名：harness 约定加载 dist/client.js（tsdown 会给非 esm 格式
    // 自动追加格式后缀，这里显式覆盖）
    outputOptions: { entryFileNames: 'client.js' },
  },
])
