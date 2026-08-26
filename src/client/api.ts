// 宿主 HTTP API 访问封装。路径常量来自 ../shared/api-paths.ts（宿主侧同源引用）。

import { API } from '../shared/api-paths'

export { API }

export interface ApiResponse<T> {
  ok: boolean
  error?: string
  data?: T
}

/** GET 并解析 JSON；不校验 ok 字段（调用方按需处理）。 */
export async function get<T>(path: string): Promise<T> {
  const resp = await fetch(path, { cache: 'no-store' })
  return resp.json()
}

/** POST JSON 并解析响应；ok=false 时抛错（错误信息取服务端 error）。 */
export async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const json = (await resp.json().catch(() => ({ ok: false, error: `HTTP ${resp.status}` }))) as T & { ok?: boolean; error?: string }
  if (!json.ok) throw new Error(json.error || `HTTP ${resp.status}`)
  return json
}
