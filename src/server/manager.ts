// 宿主 pluginManager 服务（@deepseek-ai/dsh-plugin-manager）的进程内调用层。
//
// 桌面端 profile 由应用自管的插件管理器持有，dsh CLI 按名字拒绝 `--profile
// desktop` 的包操作——桌面端不允许调命令。宿主为此发布 pluginManager 服务：
//   installBundle(spec, { enabled? })  安装（与 dsh plugin 同一 pnpm 实现）
//   removeBundle(name)                 卸载
// 基础 profile（web/desktop/headless）都提供该服务；缺席的宿主由调用方回退
// dsh CLI 子进程（lifecycle.ts）。服务结果归一到 { code, output }，与 CLI
// 路径共用后续的版本对账与响应组装。

import type { Context } from '@deepseek-ai/cordis'

/** ChangeResult 中本插件消费的字段（官方 @deepseek-ai/dsh-plugin-manager types）。 */
export interface ManagerChangeResult {
  application?: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  error?: { code?: string; diagnostic?: string } | null
  packageResult?: { exitCode?: number; output?: string } | null
}

export interface PluginManagerService {
  installBundle(spec: string, options?: { enabled?: boolean }): Promise<ManagerChangeResult>
  removeBundle(name: string): Promise<ManagerChangeResult>
}

/** 请求时探测宿主 pluginManager 服务；缺席或形状不符返回 undefined（回退 CLI）。 */
export function pluginManagerOf(ctx: Context): PluginManagerService | undefined {
  let manager: unknown
  try {
    manager = (ctx as unknown as { get(name: string): unknown }).get('pluginManager')
  } catch {
    return undefined
  }
  if (manager === null || typeof manager !== 'object') return undefined
  const m = manager as Record<string, unknown>
  if (typeof m.installBundle !== 'function' || typeof m.removeBundle !== 'function') return undefined
  return manager as PluginManagerService
}

/** 视为成功的 application 值：overridden 是「管理器已保留变更，另一层覆盖启停」，不是失败。 */
const APPLIED_APPLICATIONS = new Set(['applied', 'restart-required', 'overridden'])

/** 服务结果归一到 CLI 子进程的 { code, output } 形状。失败时 exit 0 的 packageResult 不能当成功。 */
export function managerResult(result: ManagerChangeResult): { code: number; output: string } {
  const ok = APPLIED_APPLICATIONS.has(result.application ?? 'failed')
  const output = [
    result.packageResult?.output ?? '',
    result.error?.diagnostic ?? '',
    result.error?.code ?? '',
  ]
    .filter(Boolean)
    .join('\n')
  return { code: ok ? 0 : result.packageResult?.exitCode || 1, output }
}

/** 通过 pluginManager 服务卸载一个包。 */
export async function managerRemove(
  manager: PluginManagerService,
  pkg: string,
): Promise<{ code: number; output: string }> {
  return managerResult(await manager.removeBundle(pkg))
}

/** 通过 pluginManager 服务安装/更新一个包；enabled 控制安装后是否激活 bundle 层。 */
export async function managerInstall(
  manager: PluginManagerService,
  spec: string,
  enabled: boolean,
): Promise<{ code: number; output: string }> {
  return managerResult(await manager.installBundle(spec, { enabled }))
}
