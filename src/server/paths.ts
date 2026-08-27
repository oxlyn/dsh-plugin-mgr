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
export interface IncludeLayer {
  /** cordis.yml 的实际路径（file:// 已归一化为普通路径）。 */
  path: string
  /** entry id（行 id 前缀来源）；loader 未分配时为 null。 */
  id: string | null
}

/** 全部读 cordis.yml 的 include 层。 */
function includeLayers(ctx: Context): IncludeLayer[] {
  const layers: IncludeLayer[] = []
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
    layers.push({ path: includePath, id: typeof opts.id === 'string' ? opts.id : null })
  }
  return layers
}

/**
 * 选定用于定位 profile 的 include 层：优先 DSH_PROFILE 对应的目录，退回第一个。
 * locateProfile 与 rowIdsForPackage（行 id 前缀）都必须走这里，保证口径一致。
 */
export function chooseIncludeLayer(ctx: Context): IncludeLayer | null {
  const targetProfile = process.env.DSH_PROFILE || 'web'
  const layers = includeLayers(ctx)
  return layers.find((l) => basename(dirname(l.path)) === targetProfile) ?? layers[0] ?? null
}

export function locateProfile(ctx: Context): { patchPath: string; profile: string } {
  const targetProfile = process.env.DSH_PROFILE || 'web'
  const layer = chooseIncludeLayer(ctx)
  if (layer !== null) {
    const patchPath = layer.path.replace(/cordis\.yml$/u, 'cordis.patch.yml')
    return { patchPath, profile: basename(dirname(patchPath)) }
  }
  return { patchPath: join(dshHome(), 'profiles', targetProfile, 'cordis.patch.yml'), profile: targetProfile }
}
