// 运行失败捕获：监听 fiber 状态迁移，把运行失败按包归因记录。

import type { Context } from '@deepseek-ai/cordis'
import type { StatusFiber } from './types.js'
import { failureText } from './lifecycle.js'

/**
 * FiberState（@deepseek-ai/cordis fiber.d.ts）：
 * PENDING=0 LOADING=1 ACTIVE=2 FAILED=3 DISPOSED=4 UNLOADING=5。
 * 本包不依赖 cordis 的枚举导出（const enum），按稳定数值判断。
 */
const FIBER_ACTIVE = 2
const FIBER_FAILED = 3
const FIBER_DISPOSED = 4

/** 运行失败记录：包名 → 最近一次失败信息；恢复运行或 fiber 销毁即清除。 */
const runtimeFailures = new Map<string, string>()

/** 列表展示用：某包当前的运行失败信息；无失败为 null。 */
export function runtimeFailureOf(pkg: string): string | null {
  return runtimeFailures.get(pkg) ?? null
}

/**
 * 监听 fiber 状态迁移做失败归因：
 * - FAILED：按 fiber.entry.options.name 归到插件包（entry 由 loader 挂到
 *   fiber 上，子 fiber 经原型链继承同一 entry，同样算该包内部的故障）。
 *   fiber.await() 会重抛启动错误，吞掉 rejection 只取消息。
 * - 回到 ACTIVE：视为已恢复（HMR 修复 / 配置回滚后重启成功），清除记录。
 * 注意必须 global: true —— internal 事件按上下文过滤派发，不绕过收不到
 * 兄弟插件的状态。
 */
export function watchFiberFailures(ctx: Context): void {
  ctx.on('internal/status', (fiber: StatusFiber) => {
    const pkg = fiber.entry?.options?.name
    if (typeof pkg !== 'string' || pkg === '') return
    if (fiber.state === FIBER_FAILED) {
      fiber.await().catch((e: unknown) => {
        runtimeFailures.set(pkg, failureText(e))
      })
    } else if (fiber.state === FIBER_ACTIVE || fiber.state === FIBER_DISPOSED) {
      // 回 ACTIVE 视为已恢复（HMR 修复 / 配置回滚后重启成功）；DISPOSED 清记录
      // 兜底「插件在 FAILED 状态被卸载」——否则条目无人清除，常驻内存。
      runtimeFailures.delete(pkg)
    }
  }, { global: true })
}
