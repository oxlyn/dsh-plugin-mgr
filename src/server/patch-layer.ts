// 用户补丁层（cordis.patch.yml）读写：逐行扫描 + 追加，保留用户注释。
//
// 补丁层支持逐行覆盖：
//   - id: X
//     disabled: true
// 写入后 DSH 的配置热重载（HMR）约 1s 内重新组合插件树，无需重启，
// 且每次启动都会重新应用该文件，状态跨重启保留。

import { readFileSync, writeFileSync } from 'node:fs'
import { load as parseYaml } from 'js-yaml'
import type { PatchState } from './types.js'

/** 行 id 仅接受纯标量，避免把特殊字符写进 YAML。 */
export const ROW_ID_RE = /^[A-Za-z0-9_.-]+$/u

export const PATCH_CORRUPT_REASON = '补丁层不是合法的条目数组，已拒绝写入；请先修正 cordis.patch.yml'

/** 逐行扫描补丁层：`- id: X` + 缩进 `disabled: true|false` 对。 */
export function readUserPatchState(patchPath: string): PatchState {
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

export function rowBlock(rowId: string, disabled: boolean): string {
  return `- id: ${rowId}\n  disabled: ${disabled ? 'true' : 'false'}\n`
}

/**
 * 归一化已有补丁文本以便追加：补全末尾换行；模板自带的空 `[]` 占位会被
 * 注释掉（同一文档出现两个顶层元素是非法 YAML）。文件损坏时返回 null。
 */
export function prepareAppend(text: string): string | null {
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
export function appendPatchEntry(patchPath: string, block: string): { ok: boolean; reason: string | null } {
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
export function withPlaceholderRestored(text: string): string {
  if (text.replace(/^[ \t]*#.*$/gmu, '').trim() !== '') return text
  const uncommented = text.replace(/^[ \t]*#[ \t]*\[[ \t]*\][ \t]*(?:\r?\n|$)/mu, '[]\n')
  if (uncommented !== text) return uncommented
  return text === '' || text.endsWith('\n') ? `${text}[]\n` : `${text}\n[]\n`
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** 序列化补丁层写入：并发切换不能交错 read-modify-write。 */
let writeQueue: Promise<unknown> = Promise.resolve()
function queuedWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn)
  writeQueue = run.then(() => undefined, () => undefined)
  return run
}

const ROW_ID_REJECT_REASON = (id: string) => `行 id ${id} 含特殊字符，拒绝写入补丁层`

export async function disableRows(patchPath: string, rowIds: string[]): Promise<{ ok: boolean; reason: string | null }> {
  return queuedWrite(async () => {
    const state = readUserPatchState(patchPath)
    for (const id of rowIds) {
      if (!ROW_ID_RE.test(id)) return { ok: false, reason: ROW_ID_REJECT_REASON(id) }
      if (state.disables.includes(id)) continue
      const r = appendPatchEntry(patchPath, rowBlock(id, true))
      if (!r.ok) return r
    }
    return { ok: true, reason: null }
  })
}

export async function enableRows(patchPath: string, rowIds: string[]): Promise<{ ok: boolean; reason: string | null }> {
  return queuedWrite(async () => {
    for (const id of rowIds) {
      if (!ROW_ID_RE.test(id)) return { ok: false, reason: ROW_ID_REJECT_REASON(id) }
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
      // g 标志：enable→disable 混合写回或手工编辑可能让同一 id 出现多行，全部移除
      const blockRe = new RegExp(`^- id: ['"]?${escapeRegExp(id)}['"]?\r?\n  disabled: true\r?\n`, 'gmu')
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
export async function removeRowBlocks(patchPath: string, rowIds: string[]): Promise<void> {
  return queuedWrite(async () => {
    let text = ''
    try {
      text = readFileSync(patchPath, 'utf8')
    } catch {
      return
    }
    let next = text
    for (const id of rowIds) {
      // g 标志：同一 id 可能同时有 forced 行与停用行（enable→disable 写回），必须全部移除
      const blockRe = new RegExp(`^- id: ['"]?${escapeRegExp(id)}['"]?\r?\n  disabled: (?:true|false)\r?\n`, 'gmu')
      next = next.replace(blockRe, '')
    }
    if (next !== text) writeFileSync(patchPath, withPlaceholderRestored(next))
  })
}
