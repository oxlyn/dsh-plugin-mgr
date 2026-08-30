// http 层纯函数单测：包名校验与同源校验（node:test，零额外依赖）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { _internal } from '../dist/internal.js'

const { isValidPackageName, isSameOrigin } = _internal

test('isValidPackageName: 白名单字符集，拒绝穿越/空字节/空白/非字符串', () => {
  assert.equal(isValidPackageName('dsh-plugin-mgr'), true)
  assert.equal(isValidPackageName('@scope/pkg.name_1'), true)
  assert.equal(isValidPackageName('../etc/passwd'), false)
  assert.equal(isValidPackageName('a\0b'), false)
  assert.equal(isValidPackageName('a b'), false)
  assert.equal(isValidPackageName('a;b'), false)
  assert.equal(isValidPackageName(''), false)
  assert.equal(isValidPackageName(42), false)
  assert.equal(isValidPackageName(undefined), false)
  assert.equal(isValidPackageName(null), false)
})

test('isSameOrigin: 无 Origin（非浏览器）放行；一致放行；跨站/缺 Host/坏 Origin 拒绝', () => {
  const req = (headers) => ({ headers })
  assert.equal(isSameOrigin(req({ host: '127.0.0.1:8080' })), true)
  assert.equal(isSameOrigin(req({ host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' })), true)
  assert.equal(isSameOrigin(req({ host: '127.0.0.1:8080', origin: 'http://EVIL.example' })), false)
  assert.equal(isSameOrigin(req({ host: '127.0.0.1:8080', origin: 'http://127.0.0.1:9999' })), false)
  assert.equal(isSameOrigin(req({ origin: 'http://127.0.0.1:8080' })), false)
  assert.equal(isSameOrigin(req({ host: '127.0.0.1:8080', origin: '::not a url::' })), false)
})
