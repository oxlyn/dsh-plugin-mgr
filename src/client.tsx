// dsh-plugin-mgr — client 侧入口壳（浏览器端模块）。
//
// 构建产物 dist/client.js 保持 DSH 浏览器侧的模块加载器格式：
//   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
//
// factory 只做两件事：把宿主提供的 React 注入 runtime 容器，
// 然后返回 main.ts 装配好的插件导出。其余功能全部位于 src/client/*：
//
//   runtime.ts       React 注入容器（加载器契约与 UI 的解耦点）
//   i18n.ts          zh/en 词典
//   styles.ts        内联样式表
//   api.ts           宿主 HTTP API 封装
//   toast.tsx        Toast 队列 hook + 渲染
//   PluginManagerTab.tsx  tab 主组件（状态编排）
//   components/      Toolbar / PluginCard / ConfirmModal
//   main.ts          服务接线（注册词典与 slot）

import { provideReact, provideRequire } from './client/runtime'
import { apply, inject } from './client/main'

window.__ModuleLoader__.load({
  id: 'dsh-plugin-mgr',
  factory: (require: (id: string) => any) => {
    // React 与宿主模块加载器由 harness 在运行时提供，全应用共享同一实例
    provideReact(require('react'))
    provideRequire(require)
    return { apply, inject }
  },
})
