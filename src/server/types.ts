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

// 展示模型（PluginRow / UpdateInfo）已收拢到 src/shared/types.ts 与 client
// 共用，此处转出口以维持 server 内部既有 import 路径稳定。
export type { PluginRow, UpdateInfo } from '../shared/types.js'

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
