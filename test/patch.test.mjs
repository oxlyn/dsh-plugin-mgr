// 补丁层读写逻辑单测（node:test，零额外依赖）。
// 运行：pnpm test（先 build 再对 dist 跑）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _internal } from '../dist/internal.js'

const {
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
} = _internal

/** 建临时补丁文件；initial 为 undefined 表示不创建文件。 */
function tmpPatch(t, initial) {
  const dir = mkdtempSync(join(tmpdir(), 'dshpm-test-'))
  const path = join(dir, 'cordis.patch.yml')
  if (initial !== undefined) writeFileSync(path, initial)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return {
    path,
    read: () => readFileSync(path, 'utf8'),
    write: (text) => writeFileSync(path, text),
  }
}

// ── readUserPatchState ─────────────────────────────────────────────────────

test('readUserPatchState: disables / forced、带引号 id、CRLF', (t) => {
  const { path } = tmpPatch(t, [
    '- id: a',
    '  disabled: true',
    '- id: "b"',
    '  disabled: false',
    '- id: c',
    '  disabled: false',
    '- id: d',
    '  other: 1',
  ].join('\r\n') + '\r\n')
  const state = readUserPatchState(path)
  assert.deepEqual(state, { disables: ['a'], forced: ['b', 'c'] })
})

test('readUserPatchState: 文件不存在 → 空状态', (t) => {
  const { path } = tmpPatch(t)
  assert.deepEqual(readUserPatchState(path), { disables: [], forced: [] })
})

// ── prepareAppend / appendPatchEntry ───────────────────────────────────────

test('prepareAppend: 损坏文本返回 null，其余归一化末尾换行', () => {
  assert.equal(prepareAppend('a: 1\n'), null)
  assert.equal(prepareAppend('- id: x\n  disabled: true'), '- id: x\n  disabled: true\n')
  assert.equal(prepareAppend(''), '')
  assert.equal(prepareAppend('# only comments\n'), '# only comments\n')
})

test('appendPatchEntry: 文件不存在时创建', (t) => {
  const { path, read } = tmpPatch(t)
  assert.deepEqual(appendPatchEntry(path, rowBlock('x', true)), { ok: true, reason: null })
  assert.equal(read(), '- id: x\n  disabled: true\n')
})

test('appendPatchEntry: 注释掉 [] 占位再追加', (t) => {
  const { path, read } = tmpPatch(t, '# header\n[]\n')
  assert.equal(appendPatchEntry(path, rowBlock('x', true)).ok, true)
  assert.equal(read(), '# header\n# []\n- id: x\n  disabled: true\n')
})

test('appendPatchEntry: 损坏文件拒绝写入且不改动', (t) => {
  const { path, read } = tmpPatch(t, 'not: [an\n  array: {}\n')
  const r = appendPatchEntry(path, rowBlock('x', true))
  assert.equal(r.ok, false)
  assert.ok(r.reason.includes('拒绝写入'))
  assert.equal(read(), 'not: [an\n  array: {}\n')
})

test('appendPatchEntry: 已有条目时补末尾换行后追加', (t) => {
  const { path, read } = tmpPatch(t, '- id: a\n  disabled: true') // 无末尾换行
  assert.equal(appendPatchEntry(path, rowBlock('b', false)).ok, true)
  assert.equal(read(), '- id: a\n  disabled: true\n- id: b\n  disabled: false\n')
})

// ── disableRows / enableRows / removeRowBlocks ─────────────────────────────

test('disable → enable 回环：停用行被移除、留一条强制启用行', async (t) => {
  const { path, read } = tmpPatch(t, '# note\n[]\n')
  await disableRows(path, ['x'])
  assert.ok(read().includes('- id: x\n  disabled: true\n'), read())
  await enableRows(path, ['x'])
  assert.equal(read(), '# note\n# []\n- id: x\n  disabled: false\n')
})

test('disableRows: 重复禁用幂等', async (t) => {
  const { path, read } = tmpPatch(t)
  await disableRows(path, ['x'])
  const once = read()
  await disableRows(path, ['x'])
  assert.equal(read(), once)
})

test('disableRows: 特殊字符 id 拒绝写入', async (t) => {
  const { path, read } = tmpPatch(t, '[]\n')
  const r = await disableRows(path, ['x: oops'])
  assert.equal(r.ok, false)
  assert.equal(read(), '[]\n')
})

test('enableRows: 强制启用行在写回后保留（回归：曾被旧内容覆盖）', async (t) => {
  const { path, read } = tmpPatch(t, '- id: other\n  disabled: true\n')
  const r = await enableRows(path, ['a'])
  assert.equal(r.ok, true)
  assert.ok(read().includes('- id: a\n  disabled: false\n'), read())
})

test('enableRows: 多行混合——移除停用行与强制启用同时生效（回归）', async (t) => {
  const { path, read } = tmpPatch(t, '- id: a\n  disabled: true\n')
  const r = await enableRows(path, ['a', 'b'])
  assert.equal(r.ok, true)
  const text = read()
  assert.ok(text.includes('- id: a\n  disabled: false\n'), text)
  assert.ok(text.includes('- id: b\n  disabled: false\n'), text)
})

test('enableRows: 已有 forced 行时不重写文件', async (t) => {
  const { path, read } = tmpPatch(t, '- id: x\n  disabled: false\n')
  await enableRows(path, ['x'])
  assert.equal(read(), '- id: x\n  disabled: false\n')
})

test('enableRows: 特殊字符 id 拒绝写入', async (t) => {
  const { path, read } = tmpPatch(t, '[]\n')
  const r = await enableRows(path, ['bad id'])
  assert.equal(r.ok, false)
  assert.equal(read(), '[]\n')
})

test('enableRows: 同一 id 的多行停用块全部移除', async (t) => {
  const { path, read } = tmpPatch(t, '- id: x\n  disabled: true\n- id: x\n  disabled: true\n')
  const r = await enableRows(path, ['x'])
  assert.equal(r.ok, true)
  assert.equal(read(), '# []\n- id: x\n  disabled: false\n')
})

test('enableRows: 移除停用行后强补强制启用行（防低层 bundle 的 disabled 压制复活）', async (t) => {
  const { path, read } = tmpPatch(t, '- id: x\n  disabled: true\n')
  await enableRows(path, ['x'])
  assert.equal(read(), '# []\n- id: x\n  disabled: false\n')
})

test('removeRowBlocks: 移除 true/false 行并恢复 [] 占位', async (t) => {
  const { path, read } = tmpPatch(t, '- id: a\n  disabled: true\n- id: b\n  disabled: false\n')
  await removeRowBlocks(path, ['a', 'b'])
  assert.equal(read(), '[]\n')
})

test('removeRowBlocks: 带引号 id 也能移除', async (t) => {
  const { path, read } = tmpPatch(t, '- id: "a"\n  disabled: true\n')
  await removeRowBlocks(path, ['a'])
  assert.equal(read(), '[]\n')
})

test('disableRows: 追加停用前移除同 id 的 forced 行（每 id 至多一行）', async (t) => {
  const { path, read } = tmpPatch(t, '- id: x\n  disabled: false\n')
  await disableRows(path, ['x'])
  assert.equal(read(), '- id: x\n  disabled: true\n')
})

test('启停回环：enable→disable→enable 后每 id 至多一行', async (t) => {
  const { path, read } = tmpPatch(t, '[]\n')
  await enableRows(path, ['x'])
  assert.equal(read(), '# []\n- id: x\n  disabled: false\n')
  await disableRows(path, ['x'])
  assert.equal(read(), '# []\n- id: x\n  disabled: true\n')
  await enableRows(path, ['x'])
  assert.equal(read(), '# []\n- id: x\n  disabled: false\n')
})

test('removeRowBlocks: enable→disable→卸载清理后无残留（回归：曾残留孤儿停用行，重装后被静默停用）', async (t) => {
  const { path, read } = tmpPatch(t, '[]\n')
  await enableRows(path, ['x']) // 写入 disabled: false 强制行
  await disableRows(path, ['x']) // 停用：移除 forced 行后只剩停用行
  await removeRowBlocks(path, ['x'])
  assert.equal(read(), '[]\n')
})

test('removeRowBlocks: 同一 id 的多行块全部移除（手工编辑重复行）', async (t) => {
  const { path, read } = tmpPatch(t, '- id: x\n  disabled: true\n- id: x\n  disabled: true\n')
  await removeRowBlocks(path, ['x'])
  assert.equal(read(), '[]\n')
})

test('removeRowBlocks: 文件不存在时静默跳过', async (t) => {
  const { path } = tmpPatch(t)
  await removeRowBlocks(path, ['a'])
})

// ── withPlaceholderRestored / escapeRegExp ─────────────────────────────────

test('withPlaceholderRestored: 注释掉的内容恢复为 [] 占位', () => {
  assert.equal(withPlaceholderRestored('# []\n'), '[]\n')
  assert.equal(withPlaceholderRestored(''), '[]\n')
  assert.equal(withPlaceholderRestored('# c\n'), '# c\n[]\n')
  assert.equal(withPlaceholderRestored('- id: a\n  disabled: true\n'), '- id: a\n  disabled: true\n')
})

test('escapeRegExp: 正则元字符被转义', () => {
  assert.equal(escapeRegExp('a.b*c'), 'a\\.b\\*c')
})

// ── cleanRepoUrl / sourceTypeOf ────────────────────────────────────────────

test('cleanRepoUrl: 各种 repository 写法归一化', () => {
  assert.equal(cleanRepoUrl('https://github.com/user/repo'), 'github.com/user/repo')
  assert.equal(cleanRepoUrl('https://github.com/user/repo/'), 'github.com/user/repo')
  assert.equal(cleanRepoUrl('https://github.com/user/repo.git'), 'github.com/user/repo')
  assert.equal(cleanRepoUrl('git+https://github.com/user/repo.git'), 'github.com/user/repo')
  assert.equal(cleanRepoUrl('github:user/repo'), 'github.com/user/repo')
  assert.equal(cleanRepoUrl({ url: 'https://github.com/user/repo.git' }), 'github.com/user/repo')
  assert.equal(cleanRepoUrl({ url: 'ssh://git@github.com/user/repo.git' }), null)
  assert.equal(cleanRepoUrl('https://gitlab.com/user/repo'), null)
  assert.equal(cleanRepoUrl(undefined), null)
  assert.equal(cleanRepoUrl(''), null)
})

test('sourceTypeOf: spec 分类', () => {
  assert.equal(sourceTypeOf('link:../pkg'), 'local')
  assert.equal(sourceTypeOf('file:./pkg'), 'local')
  assert.equal(sourceTypeOf('^1.0.0'), 'npm')
  assert.equal(sourceTypeOf('latest'), 'npm')
  assert.equal(sourceTypeOf('./local-pkg'), 'npm') // 相对路径不误判为 github
  assert.equal(sourceTypeOf('github:user/repo'), 'github')
  assert.equal(sourceTypeOf('git+https://github.com/user/repo.git'), 'github')
  assert.equal(sourceTypeOf('https://github.com/user/repo.git'), 'github')
  assert.equal(sourceTypeOf('user/repo'), 'github')
  assert.equal(sourceTypeOf('user/repo#v1.2.0'), 'github')
})

// ── parseNpmrcRegistry ─────────────────────────────────────────────────────

test('parseNpmrcRegistry: 解析 registry 行，跳过注释与其他配置', () => {
  assert.equal(parseNpmrcRegistry('# comment\nregistry=https://registry.npmmirror.com\n'), 'https://registry.npmmirror.com')
  assert.equal(parseNpmrcRegistry('; ini-style comment\nregistry = https://example.com/npm/\n'), 'https://example.com/npm/')
  assert.equal(parseNpmrcRegistry('registry="https://quoted.com"\n'), 'https://quoted.com')
  assert.equal(parseNpmrcRegistry('prefix=~/.npm-global\n'), null)
  assert.equal(parseNpmrcRegistry(''), null)
})

// ── compareSemver ──────────────────────────────────────────────────────────

test('compareSemver: core 三段数值比较', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0)
  assert.equal(compareSemver('1.10.0', '1.9.9'), 1)
  assert.equal(compareSemver('2.0.0', '10.0.0'), -1)
  assert.equal(compareSemver('v1.2.3', '1.2.3'), 0)
})

test('compareSemver: 预发布低于正式版、标识符数值比较', () => {
  assert.equal(compareSemver('1.2.3-beta.1', '1.2.3'), -1)
  assert.equal(compareSemver('1.2.3', '1.2.3-beta.1'), 1)
  assert.equal(compareSemver('1.2.3-beta.2', '1.2.3-beta.10'), -1)
  assert.equal(compareSemver('1.2.3-beta', '1.2.3-beta.1'), -1)
  assert.equal(compareSemver('1.2.3-rc.1', '1.2.3-beta.9'), 1)
})

test('compareSemver: 非语义化版本退化为字典序', () => {
  assert.equal(compareSemver('abc', 'abc'), 0)
  assert.equal(compareSemver('abc', 'abd'), -1)
})

// ── failureText ────────────────────────────────────────────────────────────

test('failureText: Error 取 message，其余 String()', () => {
  assert.equal(failureText(new Error('boom')), 'boom')
  assert.equal(failureText('plain string'), 'plain string')
  assert.equal(failureText(undefined), 'undefined')
  assert.equal(failureText(null), 'null')
})

// ── publishTimeOf ──────────────────────────────────────────────────────────

test('publishTimeOf: 提取指定版本发布时间，异常形状返回 null', () => {
  const packument = { time: { created: '2026-01-01T00:00:00Z', modified: '2026-02-01T00:00:00Z', '1.0.0': '2026-01-01T00:00:01Z', '1.1.0': '2026-02-01T00:00:01Z' } }
  assert.equal(publishTimeOf(packument, '1.1.0'), '2026-02-01T00:00:01Z')
  assert.equal(publishTimeOf(packument, '9.9.9'), null)
  assert.equal(publishTimeOf({ time: null }, '1.0.0'), null)
  assert.equal(publishTimeOf({ time: ['array'] }, '1.0.0'), null)
  assert.equal(publishTimeOf({}, '1.0.0'), null)
  assert.equal(publishTimeOf(null, '1.0.0'), null)
})
