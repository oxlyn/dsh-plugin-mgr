// 更新检查（npm registry）：semver 比较、registry 解析、latest/发布时间查询。

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Semver } from './types.js'
import type { UpdateInfo } from '../shared/types.js'
import { locateProfile } from './paths.js'
import { listPlugins } from './inspect.js'

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const LATEST_CACHE_TTL_MS = 5 * 60 * 1000
const LATEST_FETCH_TIMEOUT_MS = 8 * 1000
const REGISTRY_TTL_MS = 5 * 60 * 1000
/** registry 突发请求的并发上限：插件多时分批拉取，不一次打满连接。 */
const UPDATE_FETCH_CONCURRENCY = 8

/** 解析 .npmrc 文本中的 registry= 行（跳过注释、去引号）。 */
export function parseNpmrcRegistry(text: string): string | null {
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    const m = /^registry\s*=\s*(\S+)\s*$/u.exec(line)
    if (m === null) continue
    return (m[1] ?? '').replace(/^["']|["']$/gu, '')
  }
  return null
}

let cachedRegistry: { value: string; at: number } | null = null

/**
 * registry 取用顺序：DSH_PLUGIN_MGR_REGISTRY 环境变量 > npm_config_registry >
 * profile/.npmrc > ~/.npmrc > npmjs.org。国内镜像（npmmirror 等）配在 .npmrc
 * 即可被识别，与 dsh CLI 安装时的取包来源保持一致。
 * 结果带 TTL：改 .npmrc / 环境变量后最多 5 分钟生效，无需重启宿主。
 */
export function resolveRegistry(profileDir: string): string {
  if (cachedRegistry !== null && Date.now() - cachedRegistry.at < REGISTRY_TTL_MS) {
    return cachedRegistry.value
  }
  const candidates: (string | null | undefined)[] = [
    process.env.DSH_PLUGIN_MGR_REGISTRY,
    process.env.npm_config_registry,
  ]
  for (const npmrc of [join(profileDir, '.npmrc'), join(homedir(), '.npmrc')]) {
    try {
      candidates.push(parseNpmrcRegistry(readFileSync(npmrc, 'utf8')))
    } catch { /* 无该文件 */ }
  }
  let resolved: string | null = null
  for (const c of candidates) {
    if (typeof c === 'string' && c !== '') {
      resolved = c
      break
    }
  }
  cachedRegistry = { value: resolved ?? DEFAULT_REGISTRY, at: Date.now() }
  return cachedRegistry.value
}

/** 宽松解析 `v?1.2.3[-pre.1]`；非语义化版本返回 null。 */
export function parseSemver(version: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/u.exec(version.trim())
  if (m === null) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] === undefined ? [] : m[4].split('.'),
  }
}

/**
 * 语义化版本比较（-1 | 0 | 1）。任一侧无法解析时退化为字典序，
 * 只用于「最新版是否不同」的兜底判断。
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (pa === null || pb === null) return a === b ? 0 : a < b ? -1 : 1
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1
  }
  // 同 core：无预发布 > 有预发布；预发布按标识符逐个比（数字标识符数值比较）
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1
  const n = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < n; i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/u.test(x)
    const yn = /^\d+$/u.test(y)
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    } else if (xn !== yn) {
      return xn ? -1 : 1 // 数字标识符 < 字母数字标识符
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

export interface LatestCacheEntry {
  latest: string
  fetchedAt: number
  /** latest 版本的 npm 发布时间（ISO 字符串）。有更新的包才补查；null = 查过但 registry 没给 */
  publishedAt?: string | null
}

/** name → registry latest 版本（带 TTL，避免频繁刷列表打爆 registry）。 */
export const latestCache = new Map<string, LatestCacheEntry>()

async function fetchLatestVersion(name: string, registry: string): Promise<string> {
  const base = registry.replace(/\/+$/u, '')
  const resp = await fetch(`${base}/${encodeURIComponent(name)}/latest`, {
    headers: { Accept: 'application/vnd.npm.install-v1+json' },
    signal: AbortSignal.timeout(LATEST_FETCH_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const manifest = (await resp.json()) as { version?: unknown }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error('registry 响应缺少 version')
  }
  return manifest.version
}

/** 从完整 packument 的 time 字段提取指定版本的发布时间；形状异常返回 null。 */
export function publishTimeOf(manifest: unknown, version: string): string | null {
  if (manifest === null || typeof manifest !== 'object') return null
  const time = (manifest as Record<string, unknown>).time
  if (time === null || typeof time !== 'object' || Array.isArray(time)) return null
  const at = (time as Record<string, unknown>)[version]
  return typeof at === 'string' && at !== '' ? at : null
}

/** 完整 packument 才有 time 字段（/latest 缩略文档没有）；只对有更新的包调用。 */
async function fetchPublishTime(name: string, version: string, registry: string): Promise<string | null> {
  const base = registry.replace(/\/+$/u, '')
  const resp = await fetch(`${base}/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(LATEST_FETCH_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return publishTimeOf(await resp.json(), version)
}

/** 有界并发的 allSettled：等价 Promise.allSettled(items.map(fn))，但同时在飞的最多 limit 个。 */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        try {
          results[index] = { status: 'fulfilled', value: await fn(items[index]) }
        } catch (reason) {
          results[index] = { status: 'rejected', reason }
        }
      }
    }),
  )
  return results
}

/**
 * 拉取 npm 来源插件的可更新信息。只对 npm 源（semver spec）检查——
 * github/local 源的「最新」不在 npm registry 上，无从比对。
 */
export async function collectUpdates(ctx: Context): Promise<Record<string, UpdateInfo>> {
  const { patchPath } = locateProfile(ctx)
  const registry = resolveRegistry(dirname(patchPath))
  const npmPlugins = listPlugins(ctx).plugins.filter(
    (p) => p.sourceType === 'npm' && !p.protected && p.version !== '-',
  )
  const now = Date.now()
  const stale = npmPlugins.filter((p) => {
    const c = latestCache.get(p.name)
    return c === undefined || now - c.fetchedAt > LATEST_CACHE_TTL_MS
  })
  // 单包失败不拖垮整批：其余照常返回，失败的下轮再查。
  // TTL 刷新后 latest 版本没变时保留已查到的发布时间（同版本的时间不可变）。
  await mapLimit(stale, UPDATE_FETCH_CONCURRENCY, async (p) => {
    const latest = await fetchLatestVersion(p.name, registry)
    const prev = latestCache.get(p.name)
    latestCache.set(p.name, {
      latest,
      fetchedAt: Date.now(),
      publishedAt: prev !== undefined && prev.latest === latest ? prev.publishedAt : undefined,
    })
  })
  const updates: Record<string, UpdateInfo> = {}
  const needTime: string[] = []
  for (const p of npmPlugins) {
    const c = latestCache.get(p.name)
    if (c === undefined) continue
    const hasUpdate = compareSemver(c.latest, p.version) > 0
    updates[p.name] = { latest: c.latest, update: hasUpdate }
    if (hasUpdate) {
      if (c.publishedAt === undefined) needTime.push(p.name)
      else updates[p.name].publishedAt = c.publishedAt
    }
  }
  // 惰性补查发布时间：只有确认有更新的包才拉一次完整 packument（体量比
  // /latest 大一个量级，没必要为「已是最新」的包多传几十 KB）。
  // 查询失败不写缓存：下一次 /updates 自愈重试。
  await mapLimit(needTime, UPDATE_FETCH_CONCURRENCY, async (pkg) => {
    const c = latestCache.get(pkg)
    if (c === undefined) return
    const at = await fetchPublishTime(pkg, c.latest, registry)
    c.publishedAt = at
    if (updates[pkg] !== undefined) updates[pkg].publishedAt = at
  })
  return updates
}
