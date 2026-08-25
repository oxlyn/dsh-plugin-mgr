// 宿主侧共享类型与 cordis Context 的宿主服务声明。

import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * 本包用到的宿主能力（@deepseek-ai/dsh-host-webserver 与 cordis-plugin-loader
 * 增补的形状；本包不直接依赖其类型包，按实际用到的最小面声明）。
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
      }): () => void
    }
    loader: {
      entries(): Iterable<{
        options?: { id?: string; name?: string; config?: { path?: string } }
      }>
    }
  }
}

/** 已安装列表里的一行插件。 */
export interface PluginRow {
  name: string
  version: string
  spec: string
  /** 来源分类：local（link/file）| github | npm（语义化版本） */
  sourceType: 'local' | 'github' | 'npm'
  /** 插件包声明的仓库地址（github.com/user/repo 形式），无则 null */
  repo: string | null
  description: string
  disabled: boolean
  protected: boolean
  rows: string[]
  self: boolean
  /** 运行失败信息（fiber FAILED 捕获）；运行正常为 null */
  error: string | null
}

/** 用户补丁层里的逐行启停状态。 */
export interface PatchState {
  disables: string[]
  forced: string[]
}

/** 宽松语义化版本。 */
export interface Semver {
  major: number
  minor: number
  patch: number
  pre: string[]
}

/** internal/status 监听里用到的 fiber 形状（entry 由 cordis-plugin-loader 增补）。 */
export interface StatusFiber {
  state: number
  entry?: { options?: { name?: unknown } }
  await(): Promise<unknown>
}
