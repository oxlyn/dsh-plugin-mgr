// client runtime 纯函数单测：平台组件探测（node:test，零额外依赖）。
// 运行：pnpm test（先 build 再对 dist 跑）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { _internal } from '../dist/internal.js'

const { isRenderableComponent } = _internal

test('isRenderableComponent: 函数与 $$typeof 包装（forwardRef/memo）可渲染', () => {
  const fn = () => null
  assert.equal(isRenderableComponent(fn), true)
  // 宿主 0.2.0 起 Button 是 forwardRef 包装：对象带 $$typeof，typeof === 'object'
  assert.equal(isRenderableComponent({ $$typeof: Symbol.for('react.forward_ref'), render: fn }), true)
  assert.equal(isRenderableComponent({ $$typeof: Symbol.for('react.memo'), type: fn }), true)
  assert.equal(isRenderableComponent(Object.assign(fn, { $$typeof: Symbol.for('react.memo') })), true)
})

test('isRenderableComponent: 宿主缺席/坏 shim 的返回值不是组件', () => {
  assert.equal(isRenderableComponent(undefined), false)
  assert.equal(isRenderableComponent(null), false)
  // 宿主坏 shim 返回字符串标签（如 web component 名），不能当 React 组件渲染
  assert.equal(isRenderableComponent('dsh-modal'), false)
  assert.equal(isRenderableComponent(42), false)
  assert.equal(isRenderableComponent({}), false)
  assert.equal(isRenderableComponent({ render: null }), false)
})
