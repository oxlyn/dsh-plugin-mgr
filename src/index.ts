// dsh-plugin-mgr — 已安装插件管理：设置 → 插件 → 「已安装管理」tab。
//
// host 侧职责：
// - GET  /api/plugin-manager/list      列出 profile 中已安装插件 + 启停状态
// - POST /api/plugin-manager/toggle    启用/停用一个插件（写 profile 的用户补丁层）
// - POST /api/plugin-manager/uninstall 卸载插件（清理补丁层后调 dsh plugin remove）
//
// 启停机制（与 dshmarket / dsh-plugin-hub 的 plugin console 同源）：
// profile 的用户补丁层 cordis.patch.yml 支持逐行覆盖：
//   - id: X
//     disabled: true
// 写入后 DSH 的配置热重载（HMR）约 1s 内重新组合插件树，无需重启，
// 且每次启动都会重新应用该文件，状态跨重启保留。
//
// API 参考：
// - ctx.webServer.register({kind,path,handler}) — @deepseek-ai/dsh-host-webserver
// - ctx.loader.entries() — 运行中插件树的 entry 列表（定位 profile 补丁层路径用）
//
import type { Context } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as parseYaml } from 'js-yaml'

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

export const name = 'dsh-plugin-mgr'
export const inject = ['webServer', 'loader']

/** 内部纯逻辑导出：仅供单测（test/）使用，不属于插件对外 API。 */
export const _internal = {
  readUserPatchState,
  appendPatchEntry,
  prepareAppend,
  rowBlock,
  withPlaceholderRestored,
  escapeRegExp,
  disableRows,
  enableRows,
  removeRowBlocks,
  cleanRepoUrl,
  sourceTypeOf,
  parseNpmrcRegistry,
  compareSemver,
  failureText,
  publishTimeOf,
}

// ── profile 定位 ───────────────────────────────────────────────────────────

function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * 用户补丁层路径 + profile 名。
 * 优先用 loader 的 cordis:include entry 实际读取的路径（宿主自有 profile 目录时
 * 也正确）；回退到惯例位置 $DSH_HOME/profiles/<DSH_PROFILE|web>/cordis.patch.yml。
 *
 * 当 loader 中有多个 cordis:include entry 时，优先匹配 DSH_PROFILE 对应的那个，
 * 避免在多 profile 环境下选错目录。
 */
function locateProfile(ctx: Context): { patchPath: string; profile: string } {
  const targetProfile = process.env.DSH_PROFILE || 'web'
  let fallback: { patchPath: string; profile: string } | null = null
  for (const entry of ctx.loader.entries()) {
    const opts = entry.options
    if (opts?.name !== 'cordis:include' || typeof opts.config?.path !== 'string') continue
    if (!opts.config.path.endsWith('cordis.yml')) continue
    let includePath = opts.config.path
    if (includePath.startsWith('file://')) {
      try {
        includePath = fileURLToPath(includePath)
      } catch {
        includePath = includePath.replace(/^file:\/\//u, '')
      }
    }
    const patchPath = includePath.replace(/cordis\.yml$/u, 'cordis.patch.yml')
    const profile = basename(dirname(patchPath))
    if (profile === targetProfile) return { patchPath, profile }
    fallback ??= { patchPath, profile }
  }
  if (fallback) return fallback
  return { patchPath: join(dshHome(), 'profiles', targetProfile, 'cordis.patch.yml'), profile: targetProfile }
}

// ── 已安装列表 ─────────────────────────────────────────────────────────────

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

// ── 补丁层读写（逐行扫描 + 追加，保留用户注释）──────────────────────────────

interface PatchState {
  disables: string[]
  forced: string[]
}

/** 行 id 仅接受纯标量，避免把特殊字符写进 YAML。 */
const ROW_ID_RE = /^[A-Za-z0-9_.-]+$/u

/** 逐行扫描补丁层：`- id: X` + 缩进 `disabled: true|false` 对。 */
function readUserPatchState(patchPath: string): PatchState {
  const disables: string[] = []
  const forced: string[] = []
  let text = ''
  try {
    text = readFileSync(patchPath, 'utf8')
  } catch {
    return { disables, forced }
  }
  const lines = text.split(/\r?\n/u)
  for (let i = 0; i < lines.length; i++) {
    // 行 id 允许可选引号，与 enableRows/removeRowBlocks 的块删除正则同口径
    const m = /^- id: ['"]?([A-Za-z0-9_.-]+)['"]?\s*$/u.exec(lines[i] ?? '')
    if (m === null) continue
    const next = lines[i + 1] ?? ''
    if (/^ {2}disabled: true\s*$/u.test(next)) disables.push(m[1] ?? '')
    else if (/^ {2}disabled: false\s*$/u.test(next)) forced.push(m[1] ?? '')
  }
  return { disables, forced }
}

/** 补丁文本是合法的顶层数组才允许追加（坏了的文件不越改越坏）。 */
function isValidEntryText(text: string): boolean {
  try {
    return Array.isArray(parseYaml(text) as unknown)
  } catch {
    return false
  }
}

function rowBlock(rowId: string, disabled: boolean): string {
  return `- id: ${rowId}\n  disabled: ${disabled ? 'true' : 'false'}\n`
}

const PATCH_CORRUPT_REASON = '补丁层不是合法的条目数组，已拒绝写入；请先修正 cordis.patch.yml'

/**
 * 归一化已有补丁文本以便追加：补全末尾换行；模板自带的空 `[]` 占位会被
 * 注释掉（同一文档出现两个顶层元素是非法 YAML）。文件损坏时返回 null。
 */
function prepareAppend(text: string): string | null {
  const withoutComments = text.replace(/^[ \t]*#.*$/gmu, '').trim()
  if (withoutComments === '') {
    return text === '' || text.endsWith('\n') ? text : `${text}\n`
  }
  if (withoutComments === '[]' || withoutComments === '[ ]') {
    const commented = text.replace(/^[ \t]*\[[ \t]*\][ \t]*(?:#.*)?(?:\r?\n|$)/mu, '# []\n')
    return commented.endsWith('\n') ? commented : `${commented}\n`
  }
  if (!isValidEntryText(text)) return null
  return text.endsWith('\n') ? text : `${text}\n`
}

/** 追加一条顶层补丁。 */
function appendPatchEntry(patchPath: string, block: string): { ok: boolean; reason: string | null } {
  let text = ''
  try {
    text = readFileSync(patchPath, 'utf8')
  } catch {
    writeFileSync(patchPath, block)
    return { ok: true, reason: null }
  }
  const base = prepareAppend(text)
  if (base === null) return { ok: false, reason: PATCH_CORRUPT_REASON }
  writeFileSync(patchPath, `${base}${block}`)
  return { ok: true, reason: null }
}

/** 移除最后一条行后把空 `[]` 占位放回去：纯注释文件会让 profile 无法启动。 */
function withPlaceholderRestored(text: string): string {
  if (text.replace(/^[ \t]*#.*$/gmu, '').trim() !== '') return text
  const uncommented = text.replace(/^[ \t]*#[ \t]*\[[ \t]*\][ \t]*(?:\r?\n|$)/mu, '[]\n')
  if (uncommented !== text) return uncommented
  return text === '' || text.endsWith('\n') ? `${text}[]\n` : `${text}\n[]\n`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** 序列化补丁层写入：并发切换不能交错 read-modify-write。 */
let writeQueue: Promise<unknown> = Promise.resolve()
function queuedWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn)
  writeQueue = run.then(() => undefined, () => undefined)
  return run
}

async function disableRows(patchPath: string, rowIds: string[]): Promise<{ ok: boolean; reason: string | null }> {
  return queuedWrite(async () => {
    const state = readUserPatchState(patchPath)
    for (const id of rowIds) {
      if (!ROW_ID_RE.test(id)) return { ok: false, reason: `行 id ${id} 含特殊字符，拒绝写入补丁层` }
      if (state.disables.includes(id)) continue
      const r = appendPatchEntry(patchPath, rowBlock(id, true))
      if (!r.ok) return r
    }
    return { ok: true, reason: null }
  })
}

async function enableRows(patchPath: string, rowIds: string[]): Promise<{ ok: boolean; reason: string | null }> {
  return queuedWrite(async () => {
    for (const id of rowIds) {
      if (!ROW_ID_RE.test(id)) return { ok: false, reason: `行 id ${id} 含特殊字符，拒绝写入补丁层` }
    }
    let text = ''
    try {
      text = readFileSync(patchPath, 'utf8')
    } catch { /* 无补丁文件：本来就启用 */ }
    const forced = readUserPatchState(patchPath).forced
    // 全程在内存拼出最终内容、结尾一次写回：边追加边落盘会被末尾的
    // 整文件回写覆盖（追加的强制启用行凭空消失），多行混合场景同理。
    let next = text
    for (const id of rowIds) {
      const blockRe = new RegExp(`^- id: ['"]?${escapeRegExp(id)}['"]?\r?\n  disabled: true\r?\n`, 'mu')
      if (blockRe.test(next)) {
        next = withPlaceholderRestored(next.replace(blockRe, ''))
      } else if (!forced.includes(id)) {
        // 低层（bundle/模板）压住了它：用 disabled: false 强制启用
        const base = next === '' ? '' : prepareAppend(next)
        if (base === null) return { ok: false, reason: PATCH_CORRUPT_REASON }
        next = `${base}${rowBlock(id, false)}`
      }
    }
    if (next !== text) writeFileSync(patchPath, next)
    return { ok: true, reason: null }
  })
}

/** 卸载清理：移除该插件的所有启停行，不留孤儿条目。走写队列，不与启停交错。 */
async function removeRowBlocks(patchPath: string, rowIds: string[]): Promise<void> {
  return queuedWrite(async () => {
    let text = ''
    try {
      text = readFileSync(patchPath, 'utf8')
    } catch {
      return
    }
    let next = text
    for (const id of rowIds) {
      const blockRe = new RegExp(`^- id: ['"]?${escapeRegExp(id)}['"]?\r?\n  disabled: (?:true|false)\r?\n`, 'mu')
      next = next.replace(blockRe, '')
    }
    if (next !== text) writeFileSync(patchPath, withPlaceholderRestored(next))
  })
}

// ── 每个包拥有的补丁行 ────────────────────────────────────────────────────

/**
 * 一个已安装包拥有的 loader 行 id：
 * 1. 它的 bundle 补丁（dsh.bundle.patch 声明的文件）里 insert 的行
 * 2. 包根目录惯例位置 cordis.patch.yml 里 insert 的行
 * 3. loader 里当前以该包名为 name 的 entry（截掉 include: 前缀）
 * 只认 insert 行：bundle 补丁里改别人配置的行不属于它，禁用会误伤邻居。
 */
function rowIdsForPackage(ctx: Context, profileDir: string, packageName: string): string[] {
  const ids = new Set<string>()
  const packageDir = join(profileDir, 'node_modules', packageName)

  const collectInsertIds = (patchPath: string | null): void => {
    if (patchPath === null) return
    let rows: unknown
    try {
      rows = parseYaml(readFileSync(patchPath, 'utf8'))
    } catch {
      return
    }
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
      const insert = (row as Record<string, unknown>).insert
      if (!Array.isArray(insert)) continue
      for (const item of insert) {
        if (item === null || typeof item !== 'object') continue
        const id = (item as Record<string, unknown>).id
        if (typeof id === 'string' && id !== '') ids.add(id)
      }
    }
  }

  // 1. 声明的 bundle patch
  try {
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: unknown } }
    }
    const declared = manifest.dsh?.bundle?.patch
    if (typeof declared === 'string' && declared !== '') {
      collectInsertIds(join(packageDir, declared))
    }
  } catch { /* 未安装或无 manifest */ }
  // 2. 惯例位置
  collectInsertIds(join(packageDir, 'cordis.patch.yml'))

  // 3. loader 当前 entry。prefix 取与 locateProfile 相同的 include 层
  //（第一个读 cordis.yml 的 entry），避免多层 include 时两者口径不一。
  let prefix = ''
  for (const entry of ctx.loader.entries()) {
    const opts = entry.options
    if (opts?.name !== 'cordis:include' || typeof opts.id !== 'string') continue
    if (typeof opts.config?.path !== 'string' || !opts.config.path.endsWith('cordis.yml')) continue
    prefix = `${opts.id}:`
    break
  }
  for (const entry of ctx.loader.entries()) {
    if (entry.options?.name !== packageName) continue
    let id = entry.options?.id ?? ''
    if (id === '') continue
    if (prefix !== '' && id.startsWith(prefix)) id = id.slice(prefix.length)
    if (/^(?:mkt-|client-)/u.test(id)) continue
    ids.add(id)
  }
  return [...ids]
}

// ── 卸载：spawn dsh plugin remove ──────────────────────────────────────────

/** 重新调起启动本进程的 dsh CLI（源码启动/全局安装都可用），回退 PATH 上的 dsh。 */
function dshArgv(): { file: string; args: string[] } {
  const entry = process.argv[1]
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/u.test(entry)) {
    return { file: process.execPath, args: [...process.execArgv, resolve(entry)] }
  }
  return { file: 'dsh', args: [] }
}

const UNINSTALL_TIMEOUT_MS = 3 * 60 * 1000

async function runDshPlugin(profile: string, verbArgs: string[]): Promise<{ code: number | null; output: string }> {
  const { file, args } = dshArgv()
  const argv = [...args, 'plugin', '--profile', profile, ...verbArgs]
  return new Promise((resolve_) => {
    const child = spawn(file, argv, {
      cwd: undefined,
      env: { ...process.env, CI: 'true' },
      shell: false,
    })
    let out = ''
    const capture = (chunk: Buffer | string): void => {
      if (out.length < 8000) out += chunk.toString()
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    const timer = setTimeout(() => child.kill('SIGKILL'), UNINSTALL_TIMEOUT_MS)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve_({ code: -1, output: `无法启动 dsh CLI：${e.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve_({ code, output: out.trim() })
    })
  })
}

// ── 运行失败捕获（fiber 状态事件）───────────────────────────────────────────

/**
 * FiberState（@deepseek-ai/cordis fiber.d.ts）：
 * PENDING=0 LOADING=1 ACTIVE=2 FAILED=3 DISPOSED=4 UNLOADING=5。
 * 本包不依赖 cordis 的枚举导出（const enum），按稳定数值判断。
 */
const FIBER_ACTIVE = 2
const FIBER_FAILED = 3

/** 归一化失败信息：Error 取 message，其余 String()。 */
function failureText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 运行失败记录：包名 → 失败信息（同一包只留最近一条；恢复运行即清除）。 */
const runtimeFailures = new Map<string, { message: string; at: number }>()

/**
 * 监听 fiber 状态迁移做失败归因：
 * - FAILED：按 fiber.entry.options.name 归到插件包（entry 由 loader 挂到
 *   fiber 上，子 fiber 经原型链继承同一 entry，同样算该包内部的故障）。
 *   fiber.await() 会重抛启动错误，吞掉 rejection 只取消息。
 * - 回到 ACTIVE：视为已恢复（HMR 修复 / 配置回滚后重启成功），清除记录。
 * 注意必须 global: true —— internal 事件按上下文过滤派发，不绕过收不到
 * 兄弟插件的状态。
 */
function watchFiberFailures(ctx: Context): void {
  ctx.on('internal/status', (fiber: StatusFiber) => {
    const pkg = fiber.entry?.options?.name
    if (typeof pkg !== 'string' || pkg === '') return
    if (fiber.state === FIBER_FAILED) {
      fiber.await().catch((e: unknown) => {
        runtimeFailures.set(pkg, { message: failureText(e), at: Date.now() })
      })
    } else if (fiber.state === FIBER_ACTIVE) {
      runtimeFailures.delete(pkg)
    }
  }, { global: true })
}

/** internal/status 监听里用到的 fiber 形状（entry 由 cordis-plugin-loader 增补，本包无其类型）。 */
interface StatusFiber {
  state: number
  entry?: { options?: { name?: unknown } }
  await(): Promise<unknown>
}

// ── 更新检查（npm registry）────────────────────────────────────────────────

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const LATEST_CACHE_TTL_MS = 5 * 60 * 1000
const LATEST_FETCH_TIMEOUT_MS = 8 * 1000

/** 解析 .npmrc 文本中的 registry= 行（跳过注释、去引号）。 */
function parseNpmrcRegistry(text: string): string | null {
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    const m = /^registry\s*=\s*(\S+)\s*$/u.exec(line)
    if (m === null) continue
    return (m[1] ?? '').replace(/^["']|["']$/gu, '')
  }
  return null
}

let cachedRegistry: string | null = null

/**
 * registry 取用顺序：DSH_PLUGIN_MGR_REGISTRY 环境变量 > npm_config_registry >
 * profile/.npmrc > ~/.npmrc > npmjs.org。国内镜像（npmmirror 等）配在 .npmrc
 * 即可被识别，与 dsh CLI 安装时的取包来源保持一致。
 */
function resolveRegistry(profileDir: string): string {
  if (cachedRegistry !== null) return cachedRegistry
  const candidates: (string | null | undefined)[] = [
    process.env.DSH_PLUGIN_MGR_REGISTRY,
    process.env.npm_config_registry,
  ]
  for (const npmrc of [join(profileDir, '.npmrc'), join(homedir(), '.npmrc')]) {
    try {
      candidates.push(parseNpmrcRegistry(readFileSync(npmrc, 'utf8')))
    } catch { /* 无该文件 */ }
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c !== '') {
      cachedRegistry = c
      return c
    }
  }
  cachedRegistry = DEFAULT_REGISTRY
  return DEFAULT_REGISTRY
}

interface Semver {
  major: number
  minor: number
  patch: number
  pre: string[]
}

/** 宽松解析 `v?1.2.3[-pre.1]`；非语义化版本返回 null。 */
function parseSemver(version: string): Semver | null {
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
function compareSemver(a: string, b: string): number {
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

interface LatestCacheEntry {
  latest: string
  fetchedAt: number
  /** latest 版本的 npm 发布时间（ISO 字符串）。有更新的包才补查；null = 查过但 registry 没给 */
  publishedAt?: string | null
}

/** name → registry latest 版本（带 TTL，避免频繁刷列表打爆 registry）。 */
const latestCache = new Map<string, LatestCacheEntry>()

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
function publishTimeOf(manifest: unknown, version: string): string | null {
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

/**
 * 拉取 npm 来源插件的可更新信息。只对 npm 源（semver spec）检查——
 * github/local 源的「最新」不在 npm registry 上，无从比对。
 */
async function collectUpdates(ctx: Context): Promise<Record<string, { latest: string; update: boolean }>> {
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
  await Promise.allSettled(
    stale.map(async (p) => {
      const latest = await fetchLatestVersion(p.name, registry)
      const prev = latestCache.get(p.name)
      latestCache.set(p.name, {
        latest,
        fetchedAt: Date.now(),
        publishedAt: prev !== undefined && prev.latest === latest ? prev.publishedAt : undefined,
      })
    }),
  )
  const updates: Record<string, { latest: string; update: boolean; publishedAt?: string | null }> = {}
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
  await Promise.allSettled(
    needTime.map(async (pkg) => {
      const c = latestCache.get(pkg)
      if (c === undefined) return
      const at = await fetchPublishTime(pkg, c.latest, registry)
      c.publishedAt = at
      if (updates[pkg] !== undefined) updates[pkg].publishedAt = at
    }),
  )
  return updates
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, code: number, obj: unknown): void {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

/** 读 JSON body（限 64KB），且必须是 application/json（兼作 CSRF 门卫）。 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
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

// ── apply ──────────────────────────────────────────────────────────────────

interface PluginRow {
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

/** 归一化 repository 字段为 github.com/user/repo 形式；不认识的返回 null。 */
function cleanRepoUrl(repo: unknown): string | null {
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
function sourceTypeOf(spec: string): 'local' | 'github' | 'npm' {
  if (spec.startsWith('link:') || spec.startsWith('file:')) return 'local'
  if (/github\.com|(^|:)github:|^git\+/u.test(spec)) return 'github'
  // npm 的 user/repo 短写法（非 @scope、非 ./ 相对路径）也指向 GitHub
  if (/^[A-Za-z0-9][\w.-]*\/[\w.-]+(?:#.*)?$/u.test(spec)) return 'github'
  return 'npm'
}

function listPlugins(ctx: Context): { profile: string; plugins: PluginRow[] } {
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
      self: dep === name,
      error: runtimeFailures.get(dep)?.message ?? null,
    })
  }
  plugins.sort((a, b) => a.name.localeCompare(b.name))
  return { profile, plugins }
}

export function apply(ctx: Context) {
  const logger = ctx.logger(name)
  watchFiberFailures(ctx)
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/plugin-manager/list',
    handler: (_req, res) => {
      try {
        sendJson(res, 200, { ok: true, ...listPlugins(ctx) })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: `读取已安装插件失败：${(e as Error).message}` })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/api/plugin-manager/toggle',
    handler: async (req, res) => {
      let body: Record<string, unknown>
      try {
        body = await readJsonBody(req)
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: (e as Error).message })
      }
      const pkg = body.name
      const disable = body.disable
      if (typeof pkg !== 'string' || typeof disable !== 'boolean') {
        return sendJson(res, 400, { ok: false, error: '参数错误：需要 { name: string, disable: boolean }' })
      }
      let patchPath: string
      let profile: string
      let current: PluginRow | undefined
      try {
        ;({ patchPath, profile } = locateProfile(ctx))
        current = listPlugins(ctx).plugins.find((p) => p.name === pkg)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: `读取已安装插件失败：${(e as Error).message}` })
      }
      if (current === undefined) return sendJson(res, 404, { ok: false, error: `未找到插件 ${pkg}` })
      if (current.protected) return sendJson(res, 400, { ok: false, error: `${pkg} 是宿主基础设施，不允许启停` })
      if (current.self) return sendJson(res, 400, { ok: false, error: '不能停用插件管理器自身（停用后无人再把它启用）' })
      if (current.rows.length === 0) {
        return sendJson(res, 400, { ok: false, error: `${pkg} 没有可控制的补丁行（纯 client 插件不支持补丁层启停）` })
      }
      const result = disable
        ? await disableRows(patchPath, current.rows)
        : await enableRows(patchPath, current.rows)
      if (!result.ok) return sendJson(res, 500, { ok: false, error: result.reason })
      logger.info(`${disable ? 'disabled' : 'enabled'} ${pkg} in profile ${profile} (patch layer, HMR applies in ~1s)`)
      sendJson(res, 200, { ok: true, name: pkg, disabled: disable })
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/api/plugin-manager/uninstall',
    handler: async (req, res) => {
      let body: Record<string, unknown>
      try {
        body = await readJsonBody(req)
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: (e as Error).message })
      }
      const pkg = body.name
      if (typeof pkg !== 'string' || pkg === '' || pkg.includes('..') || pkg.includes('\0') || !/^[@a-z0-9_.@\/-]+$/i.test(pkg)) {
        return sendJson(res, 400, { ok: false, error: '参数错误：包名格式非法' })
      }
      let patchPath: string
      let profile: string
      let current: PluginRow | undefined
      try {
        ;({ patchPath, profile } = locateProfile(ctx))
        current = listPlugins(ctx).plugins.find((p) => p.name === pkg)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: `读取已安装插件失败：${(e as Error).message}` })
      }
      if (current === undefined) return sendJson(res, 404, { ok: false, error: `未找到插件 ${pkg}` })
      if (current.protected) return sendJson(res, 400, { ok: false, error: `${pkg} 是宿主基础设施，不允许卸载` })
      if (current.self && !body.selfConfirm) {
        return sendJson(res, 400, { ok: false, error: '卸载自身需要 selfConfirm: true（面板已自动携带）' })
      }
      // 先清理补丁层启停行，再让 dsh CLI 移除依赖与 bundle。
      // CLI 运行期间新到的 toggle 请求可能又写回启停行，成功后再清一次兜底。
      await removeRowBlocks(patchPath, current.rows)
      const result = await runDshPlugin(profile, ['remove', pkg])
      if (result.code !== 0) {
        return sendJson(res, 500, { ok: false, error: `dsh plugin remove 失败（exit ${result.code}）：${result.output.slice(-1500)}` })
      }
      await removeRowBlocks(patchPath, current.rows)
      logger.info(`uninstalled ${pkg} from profile ${profile}`)
      sendJson(res, 200, { ok: true, name: pkg, output: result.output.slice(-500) })
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/api/plugin-manager/updates',
    handler: async (_req, res) => {
      try {
        const updates = await collectUpdates(ctx)
        sendJson(res, 200, { ok: true, updates })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: `检查插件更新失败：${(e as Error).message}` })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/api/plugin-manager/update',
    handler: async (req, res) => {
      let body: Record<string, unknown>
      try {
        body = await readJsonBody(req)
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: (e as Error).message })
      }
      const pkg = body.name
      if (typeof pkg !== 'string' || pkg === '' || pkg.includes('..') || pkg.includes('\0') || !/^[@a-z0-9_.@\/-]+$/i.test(pkg)) {
        return sendJson(res, 400, { ok: false, error: '参数错误：包名格式非法' })
      }
      let patchPath: string
      let profile: string
      let current: PluginRow | undefined
      try {
        ;({ patchPath, profile } = locateProfile(ctx))
        current = listPlugins(ctx).plugins.find((p) => p.name === pkg)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: `读取已安装插件失败：${(e as Error).message}` })
      }
      if (current === undefined) return sendJson(res, 404, { ok: false, error: `未找到插件 ${pkg}` })
      if (current.protected) return sendJson(res, 400, { ok: false, error: `${pkg} 是宿主基础设施，不允许更新` })
      if (current.sourceType !== 'npm') {
        return sendJson(res, 400, { ok: false, error: `${pkg} 不是 npm 来源，请通过原始安装来源更新` })
      }
      if (current.self && !body.selfConfirm) {
        return sendJson(res, 400, { ok: false, error: '更新自身需要 selfConfirm: true（面板已自动携带）' })
      }
      const wasDisabled = current.disabled
      const expectedLatest = latestCache.get(pkg)?.latest ?? null
      const result = await runDshPlugin(profile, ['add', `${pkg}@latest`])
      if (result.code !== 0) {
        return sendJson(res, 500, { ok: false, error: `dsh plugin add 失败（exit ${result.code}）：${result.output.slice(-1500)}` })
      }
      // add 重铺 bundle 补丁行后，若更新前是停用状态，重读行并重新断言停用，
      // 避免更新把用户的启停选择冲掉。disableRows 幂等，已是停用则不动文件。
      try {
        const fresh = listPlugins(ctx).plugins.find((p) => p.name === pkg)
        if (fresh !== undefined && wasDisabled && !fresh.disabled) {
          await disableRows(patchPath, fresh.rows)
        }
      } catch { /* 刷新失败不影响更新结果 */ }
      latestCache.delete(pkg)
      // pnpm 的 minimumReleaseAge 供应链门禁会静默跳过「发布过新」的版本，
      // 以 exit 0 + Already up to date 收场——exit 码不代表真装上了。
      // 以磁盘实际版本对账，如实告诉前端。
      let installed: string | null = null
      try {
        installed = listPlugins(ctx).plugins.find((p) => p.name === pkg)?.version ?? null
      } catch { /* 读取失败按未知处理 */ }
      const updated =
        installed !== null && installed !== '-' &&
        (expectedLatest !== null ? installed === expectedLatest : installed !== current.version)
      logger.info(`updated ${pkg} to ${installed ?? '?'} in profile ${profile}`)
      sendJson(res, 200, {
        ok: true, name: pkg, version: installed,
        expected: expectedLatest, updated,
        output: result.output.slice(-500),
      })
    },
  })

  logger.info(
    `ready — routes GET /api/plugin-manager/list, GET /api/plugin-manager/updates, ` +
      `POST /api/plugin-manager/toggle, POST /api/plugin-manager/uninstall, POST /api/plugin-manager/update`,
  )
}
