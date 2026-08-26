// dsh-plugin-mgr — client 侧运行时注入容器。
//
// DSH 浏览器侧的模块加载器约定：React 与宿主模块只能通过 factory(require)
// 在入口处获取，无法作为普通 ESM 导入。入口在 factory 内调用 provideReact()
// 与 provideRequire() 注入，各组件通过 getReact() / getRequire() 取用。

type ReactModule = typeof import('react')

let injectedReact: ReactModule | null = null
let injectedRequire: ((id: string) => any) | null = null

/** 入口在 factory 内注入宿主提供的 React 实例。 */
export function provideReact(react: ReactModule): void {
  injectedReact = react
}

/** 入口在 factory 内注入宿主提供的 require，用于按需解析宿主模块。 */
export function provideRequire(requireFn: (id: string) => any): void {
  injectedRequire = requireFn
}

/** 取用注入的 React。必须在 provideReact 之后（即任意渲染发生前）调用。 */
export function getReact(): ReactModule {
  if (!injectedReact) {
    throw new Error('[dsh-plugin-mgr] React 尚未注入：entry 需先调用 provideReact()')
  }
  return injectedReact
}

/** 取用注入的 require，用于按需解析宿主模块（如 dsh-client-ui-primitives）。 */
export function getRequire(): (id: string) => any {
  if (!injectedRequire) {
    throw new Error('[dsh-plugin-mgr] require 尚未注入：entry 需先调用 provideRequire()')
  }
  return injectedRequire
}
