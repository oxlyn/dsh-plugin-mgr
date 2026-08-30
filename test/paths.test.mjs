// profile 定位单测：include 层选择与回退路径（node:test，零额外依赖）。
// chooseIncludeLayer 的口径一致性曾出过回归（见 a7f622a），这里锁住行为。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _internal } from '../dist/internal.js'

const { chooseIncludeLayer, locateProfile } = _internal

/** 构造带 loader entries 的最小假 ctx（includeLayers 只读 loader.entries()）。 */
function fakeCtx(entries) {
  return { loader: { entries: () => entries } }
}

const includeEntry = (id, path) => ({ options: { name: 'cordis:include', id, config: { path } } })

test('chooseIncludeLayer: 优先 DSH_PROFILE 对应目录，无匹配取第一个，无层返回 null', (t) => {
  const saved = process.env.DSH_PROFILE
  t.after(() => {
    if (saved === undefined) delete process.env.DSH_PROFILE
    else process.env.DSH_PROFILE = saved
  })
  const ctx = fakeCtx([
    includeEntry('a', '/x/profiles/alpha/cordis.yml'),
    includeEntry('b', '/x/profiles/beta/cordis.yml'),
  ])
  process.env.DSH_PROFILE = 'beta'
  assert.equal(chooseIncludeLayer(ctx)?.id, 'b')
  process.env.DSH_PROFILE = 'missing'
  assert.equal(chooseIncludeLayer(ctx)?.id, 'a')
  delete process.env.DSH_PROFILE // 默认 web：无匹配 → 第一个
  assert.equal(chooseIncludeLayer(ctx)?.id, 'a')
  assert.equal(chooseIncludeLayer(fakeCtx([])), null)
})

test('chooseIncludeLayer: 非 cordis:include / 非 cordis.yml 的 entry 不参与', () => {
  const ctx = fakeCtx([
    { options: { name: 'other-plugin', id: 'x', config: { path: '/p/cordis.yml' } } },
    includeEntry('y', '/p/other.yml'),
    { options: { name: 'cordis:include', config: { path: '/p/cordis.yml' } } }, // 无 id
  ])
  const layer = chooseIncludeLayer(ctx)
  assert.equal(layer?.id, null)
  assert.equal(layer?.path, '/p/cordis.yml')
})

test('locateProfile: 有层取层目录（file:// 归一化），无层回退 DSH_HOME 惯例位置', (t) => {
  const savedProfile = process.env.DSH_PROFILE
  const savedHome = process.env.DSH_HOME
  t.after(() => {
    if (savedProfile === undefined) delete process.env.DSH_PROFILE
    else process.env.DSH_PROFILE = savedProfile
    if (savedHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = savedHome
  })
  delete process.env.DSH_PROFILE
  assert.deepEqual(locateProfile(fakeCtx([includeEntry('a', 'file:///x/profiles/web/cordis.yml')])), {
    patchPath: '/x/profiles/web/cordis.patch.yml',
    profile: 'web',
  })
  const home = mkdtempSync(join(tmpdir(), 'dshpm-home-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  process.env.DSH_HOME = home
  assert.deepEqual(locateProfile(fakeCtx([])), {
    patchPath: join(home, 'profiles', 'web', 'cordis.patch.yml'),
    profile: 'web',
  })
})
