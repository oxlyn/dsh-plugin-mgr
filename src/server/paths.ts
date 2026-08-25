// profile 定位：用户补丁层路径 + profile 名。

import type { Context } from '@deepseek-ai/cordis'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * 用户补丁层路径 + profile 名。
 * 优先用 loader 的 cordis:include entry 实际读取的路径（宿主自有 profile 目录时
 * 也正确）；回退到惯例位置 $DSH_HOME/profiles/<DSH_PROFILE|web>/cordis.patch.yml。
 *
 * 当 loader 中有多个 cordis:include entry 时，优先匹配 DSH_PROFILE 对应的那个，
 * 避免在多 profile 环境下选错目录。
 */
export function locateProfile(ctx: Context): { patchPath: string; profile: string } {
  const targetProfile = process.env.DSH_PROFILE || 'web'
  let fallback: { patchPath: string; profile: string } | null = null
  for (const entry of ctx.loader.entries()) {
    const opts = entry.options
    if (opts?.name !== 'cordis:include' || typeof opts.config?.path !== 'string') continue
    if (!opts.config.path.endsWith('cordis.yml')) continue
    let includePath = opts.config.path
    if (includePath.startsWith('file://')) {
      try {
        includePath = fileURLToPath(includePath)
      } catch {
        includePath = includePath.replace(/^file:\/\//u, '')
      }
    }
    const patchPath = includePath.replace(/cordis\.yml$/u, 'cordis.patch.yml')
    const profile = basename(dirname(patchPath))
    if (profile === targetProfile) return { patchPath, profile }
    fallback ??= { patchPath, profile }
  }
  if (fallback) return fallback
  return { patchPath: join(dshHome(), 'profiles', targetProfile, 'cordis.patch.yml'), profile: targetProfile }
}
