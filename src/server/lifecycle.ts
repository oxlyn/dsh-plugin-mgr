// 通过 dsh CLI 子进程执行卸载/更新（spawn `dsh plugin ...`）。

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

/** 重新调起启动本进程的 dsh CLI（源码启动/全局安装都可用），回退 PATH 上的 dsh。 */
function dshArgv(): { file: string; args: string[] } {
  const entry = process.argv[1]
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/u.test(entry)) {
    return { file: process.execPath, args: [...process.execArgv, resolve(entry)] }
  }
  return { file: 'dsh', args: [] }
}

const UNINSTALL_TIMEOUT_MS = 3 * 60 * 1000

/** 在指定 profile 上执行 `dsh plugin <verbArgs>`，捕获输出与退出码。 */
export async function runDshPlugin(profile: string, verbArgs: string[]): Promise<{ code: number | null; output: string }> {
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

/** 归一化失败信息：Error 取 message，其余 String()。 */
export function failureText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
