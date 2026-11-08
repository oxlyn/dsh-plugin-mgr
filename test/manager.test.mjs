// pluginManager 服务结果归一化单测（node:test，零额外依赖）。
// 运行：pnpm test（先 build 再对 dist 跑）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { _internal } from '../dist/internal.js'

const { managerResult } = _internal

test('managerResult: applied / restart-required / overridden 都算成功', () => {
  assert.deepEqual(managerResult({ application: 'applied', packageResult: { exitCode: 0, output: 'ok' } }), {
    code: 0,
    output: 'ok',
  })
  // restart-required：无 HMR 时装上了但激活等重启，仍是成功
  assert.equal(managerResult({ application: 'restart-required', packageResult: { exitCode: 0, output: '' } }).code, 0)
  // overridden：管理器保留了变更，只是另一层覆盖启停，不是失败
  assert.equal(managerResult({ application: 'overridden', packageResult: { exitCode: 0, output: '' } }).code, 0)
})

test('managerResult: failed/cancelled/缺失都算失败，exit 0 的 packageResult 不当成功', () => {
  // enable 阶段失败跟随成功的 pnpm 步骤（exit 0），必须不能读成成功
  assert.equal(managerResult({ application: 'failed', packageResult: { exitCode: 0, output: 'pnpm ok' } }).code, 1)
  assert.equal(managerResult({ application: 'failed', packageResult: { exitCode: 1, output: 'boom' } }).code, 1)
  assert.equal(managerResult({ application: 'cancelled' }).code, 1)
  assert.equal(managerResult({}).code, 1)
  // 没有 packageResult 的失败也给 1
  assert.equal(managerResult({ application: 'failed' }).code, 1)
})

test('managerResult: 输出按 pnpm 输出 + 诊断 + 错误码拼接，空段丢弃', () => {
  assert.equal(
    managerResult({
      application: 'failed',
      error: { code: 'not-removable', diagnostic: 'bundle is running' },
      packageResult: { exitCode: 1, output: 'pnpm says no' },
    }).output,
    'pnpm says no\nbundle is running\nnot-removable',
  )
  assert.equal(managerResult({ application: 'applied' }).output, '')
  assert.equal(managerResult({ application: 'applied', error: { code: '' } }).output, '')
})
