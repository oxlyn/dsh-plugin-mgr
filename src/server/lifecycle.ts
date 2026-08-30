// 通过 dsh CLI 子进程执行卸载/更新（spawn `dsh plugin ...`）。

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

/** 重新调起启动本进程的 dsh CLI（源码启动/全局安装都可用），回退 PATH 上的 dsh。 */
function dshArgv(): { file: string; args: string[]; shell: boolean } {
  const entry = process.argv[1]
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/u.test(entry)) {
    return { file: process.execPath, args: [...process.execArgv, resolve(entry)], shell: false }
  }
  // Windows 的 npm 全局命令是 .cmd shim，Node 拒绝无 shell 直接 spawn，改走 cmd
  if (process.platform === 'win32') return { file: 'dsh.cmd', args: [], shell: true }
  return { file: 'dsh', args: [], shell: false }
}

const UNINSTALL_TIMEOUT_MS = 3 * 60 * 1000
const SIGTERM_GRACE_MS = 10 * 1000

/** 在指定 profile 上执行 `dsh plugin <verbArgs>`，捕获输出与退出码。 */
export async function runDshPlugin(profile: string, verbArgs: string[]): Promise<{ code: number | null; output: string }> {
  const { file, args, shell } = dshArgv()
  const argv = [...args, 'plugin', '--profile', profile, ...verbArgs]
  // shell 模式下参数拼进命令行：含空格的 profile 要加引号（包名已受字符集白名单约束）
  const quote = (s: string): string => (shell && /\s/u.test(s) ? `"${s}"` : s)
  return new Promise((resolve_) => {
    const child = spawn(file, argv.map(quote), {
      cwd: undefined,
      env: { ...process.env, CI: 'true' },
      shell,
    })
    let out = ''
    const capture = (chunk: Buffer | string): void => {
      if (out.length < 8000) out += chunk.toString()
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    // 超时先礼后兵：SIGTERM 给 pnpm 清理锁与 store 的机会，宽限后仍不退才 SIGKILL
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), SIGTERM_GRACE_MS)
    }, UNINSTALL_TIMEOUT_MS)
    const settle = (code: number | null, output: string): void => {
      clearTimeout(timer)
      if (killTimer !== undefined) clearTimeout(killTimer)
      resolve_({ code, output })
    }
    child.on('error', (e) => {
      settle(-1, `无法启动 dsh CLI：${e.message}`)
    })
    child.on('close', (code) => {
      settle(code, out.trim())
    })
  })
}

/** 归一化失败信息：Error 取 message，其余 String()。 */
export function failureText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
