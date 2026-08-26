/**
 * DSH 浏览器侧运行时的最小类型声明。
 *
 * client 模块以 `window.__ModuleLoader__.load({ id, factory })` 格式被
 * harness 的模块加载器执行；factory 收到的 require() 由加载器注入，
 * 用于在运行时解析 react 等浏览器侧依赖（非 Node 的 CommonJS require）。
 */

interface DSHModuleSpec {
  /** 全局唯一模块 id */
  id: string
  /** 模块工厂：接收加载器注入的 require，返回模块导出 */
  factory: (require: (id: string) => any) => unknown
}

interface Window {
  __ModuleLoader__: {
    load(spec: DSHModuleSpec): void
  }
}
