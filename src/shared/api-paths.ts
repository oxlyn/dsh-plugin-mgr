// 宿主 HTTP 路由与客户端 fetch 共用的路径常量。
// 宿主（tsc）与 client bundle（esbuild）都能直接 import 这个 TS 文件。

export const API_BASE = '/api/plugin-manager'

export const API = {
  /** GET：列出 profile 已安装插件 + 启停状态 */
  list: `${API_BASE}/list`,
  /** POST { name, disable }：启用/停用一个插件 */
  toggle: `${API_BASE}/toggle`,
  /** POST { name, selfConfirm? }：卸载插件 */
  uninstall: `${API_BASE}/uninstall`,
  /** GET：npm 来源插件的可更新信息 */
  updates: `${API_BASE}/updates`,
  /** POST { name, selfConfirm? }：更新到 latest */
  update: `${API_BASE}/update`,
} as const
