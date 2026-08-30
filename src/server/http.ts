// HTTP 小工具：JSON 响应与请求体读取。

import type { IncomingMessage, ServerResponse } from 'node:http'

export function sendJson(res: ServerResponse, code: number, obj: unknown): void {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

/** 读 JSON body（限 64KB），且必须是 application/json（兼作 CSRF 门卫）。 */
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const ct = String(req.headers['content-type'] ?? '')
  if (!ct.includes('application/json')) {
    throw new Error('Content-Type 必须是 application/json')
  }
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 65536) throw new Error('请求体过大')
  }
  if (body === '') return {}
  const parsed = JSON.parse(body) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('请求体必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

/**
 * 同源校验：浏览器发起的跨站请求会带 Origin 头，与 Host 不一致即拒绝
 * （兼防 DNS rebinding）；非浏览器客户端（curl 等）没有 Origin，放行。
 * 与 Content-Type 校验叠加，作为状态变更路由的第二道 CSRF 门卫。
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined) return true
  const host = req.headers.host
  if (host === undefined) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

/** 包名参数校验：非空、无路径穿越/空字节、字符集白名单。 */
export function isValidPackageName(pkg: unknown): pkg is string {
  return (
    typeof pkg === 'string' &&
    pkg !== '' &&
    !pkg.includes('..') &&
    !pkg.includes('\0') &&
    /^[@a-z0-9_.@/-]+$/i.test(pkg)
  )
}
