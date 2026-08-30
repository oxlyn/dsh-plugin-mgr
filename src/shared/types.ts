// server 与 client 共用的展示模型。
// 与 api-paths.ts 同理：宿主侧（tsc）与 client bundle（tsdown iife）都能直接
// import 这个 TS 文件，两端形状由这里单点维护。

/** 已安装列表里的一行插件（/list 的单行返回）。 */
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

/** npm registry 更新信息（/updates 的单包条目）。 */
export interface UpdateInfo {
  latest: string
  update: boolean
  /** latest 版本的 npm 发布时间（ISO 字符串）；null = 查过但 registry 没给 */
  publishedAt?: string | null
}
