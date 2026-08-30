// 已安装插件列表：读 profile manifest + 补丁状态 + 运行失败，组装成展示行。

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PluginRow } from './types.js'
import { locateProfile } from './paths.js'
import { readUserPatchState } from './patch-layer.js'
import { rowIdsForPackage } from './rows.js'
import { runtimeFailureOf } from './fiber-watch.js'

/** dsh 官方 profile 模板自带的 bundle，不展示在已安装列表里。 */
const INBOX_BUNDLES = new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
])

/** 宿主基础设施模块：禁用会破坏补丁层自身赖以运行的链路，拒绝启停/卸载。 */
const PROTECTED_PATTERNS = [
  /^cordis:/u,
  /^@deepseek-ai\/cordis-plugin-/u,
  /^@deepseek-ai\/dsh-host-/u,
  /^@deepseek-ai\/dsh-client-modules$/u,
  /^@deepseek-ai\/dsh-client-connection$/u,
  /^@deepseek-ai\/dsh-client-hmr$/u,
  /^@deepseek-ai\/dsh-client-runtime$/u,
  /^@deepseek-ai\/dsh-client-locale$/u,
  /^@deepseek-ai\/dsh-client-web/u,
  /^@deepseek-ai\/dsh-web-frontend$/u,
  /^@deepseek-ai\/dsh-web-app$/u,
  /^@deepseek-ai\/dsh-settings/u,
  /^@deepseek-ai\/dsh-credentials/u,
  /^@deepseek-ai\/dsh-session/u,
  /^@deepseek-ai\/dsh-storage/u,
  /^@deepseek-ai\/dsh-api-remotes$/u,
  /^@deepseek-ai\/dsh-tools$/u,
  /^@deepseek-ai\/dsh-llm/u,
]

/** 归一化 repository 字段为 github.com/user/repo 形式；不认识的返回 null。 */
export function cleanRepoUrl(repo: unknown): string | null {
  let url: string | null = null
  if (typeof repo === 'string') url = repo
  else if (repo !== null && typeof repo === 'object' && typeof (repo as Record<string, unknown>).url === 'string') {
    url = (repo as Record<string, unknown>).url as string
  }
  if (url === null || url === '') return null
  let u = url.replace(/^git\+/u, '')
  if (u.startsWith('github:')) u = u.replace(/^github:/u, 'https://github.com/')
  u = u.replace(/\.git$/u, '')
  if (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/u.test(u)) {
    return u.replace(/^https:\/\//u, '').replace(/\/$/u, '')
  }
  return null
}

/** 从依赖 spec 判断来源分类。 */
export function sourceTypeOf(spec: string): 'local' | 'github' | 'npm' {
  if (spec.startsWith('link:') || spec.startsWith('file:')) return 'local'
  if (/github\.com|(^|:)github:|^git\+/u.test(spec)) return 'github'
  // npm 的 user/repo 短写法（非 @scope、非 ./ 相对路径）也指向 GitHub
  if (/^[A-Za-z0-9][\w.-]*\/[\w.-]+(?:#.*)?$/u.test(spec)) return 'github'
  return 'npm'
}

export function listPlugins(ctx: Context): { profile: string; plugins: PluginRow[] } {
  const { patchPath, profile } = locateProfile(ctx)
  const profileDir = dirname(patchPath)
  const state = readUserPatchState(patchPath)

  let manifest: { dependencies?: Record<string, string> }
  try {
    manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
  } catch {
    throw new Error(`profile 的 package.json 不存在或无法解析：${join(profileDir, 'package.json')}`)
  }
  const plugins: PluginRow[] = []
  for (const [dep, spec] of Object.entries(manifest.dependencies ?? {})) {
    if (INBOX_BUNDLES.has(dep)) continue
    let version = '-'
    let description = ''
    let repo: string | null = null
    try {
      const pkg = JSON.parse(readFileSync(join(profileDir, 'node_modules', dep, 'package.json'), 'utf8')) as {
        version?: string
        description?: string
        repository?: unknown
      }
      version = pkg.version ?? '-'
      description = pkg.description ?? ''
      repo = cleanRepoUrl(pkg.repository)
    } catch { /* link 断链等 */ }
    const rows = rowIdsForPackage(ctx, profileDir, dep)
    const disabled = rows.some((id) => state.disables.includes(id))
    plugins.push({
      name: dep,
      version,
      spec,
      sourceType: sourceTypeOf(spec),
      repo,
      description,
      disabled,
      protected: PROTECTED_PATTERNS.some((re) => re.test(dep)),
      rows,
      self: dep === SELF_NAME,
      error: runtimeFailureOf(dep),
    })
  }
  plugins.sort((a, b) => a.name.localeCompare(b.name))
  return { profile, plugins }
}

/**
 * 本包名：listPlugins 用它标记 self 行。从自身 package.json 读取，
 * 包改名后自保护不失效；读不到时退回构建期常量。
 */
export const SELF_NAME = (() => {
  try {
    const manifest = createRequire(import.meta.url)('../package.json') as { name?: unknown }
    return typeof manifest.name === 'string' && manifest.name !== '' ? manifest.name : 'dsh-plugin-mgr'
  } catch {
    return 'dsh-plugin-mgr'
  }
})()
