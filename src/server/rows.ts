// 一个已安装包拥有的 loader 补丁行 id。

import type { Context } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'

/**
 * 一个已安装包拥有的 loader 行 id：
 * 1. 它的 bundle 补丁（dsh.bundle.patch 声明的文件）里 insert 的行
 * 2. 包根目录惯例位置 cordis.patch.yml 里 insert 的行
 * 3. loader 里当前以该包名为 name 的 entry（截掉 include: 前缀）
 * 只认 insert 行：bundle 补丁里改别人配置的行不属于它，禁用会误伤邻居。
 */
export function rowIdsForPackage(ctx: Context, profileDir: string, packageName: string): string[] {
  const ids = new Set<string>()
  const packageDir = join(profileDir, 'node_modules', packageName)

  const collectInsertIds = (patchPath: string | null): void => {
    if (patchPath === null) return
    let rows: unknown
    try {
      rows = parseYaml(readFileSync(patchPath, 'utf8'))
    } catch {
      return
    }
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
      const insert = (row as Record<string, unknown>).insert
      if (!Array.isArray(insert)) continue
      for (const item of insert) {
        if (item === null || typeof item !== 'object') continue
        const id = (item as Record<string, unknown>).id
        if (typeof id === 'string' && id !== '') ids.add(id)
      }
    }
  }

  // 1. 声明的 bundle patch
  try {
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: unknown } }
    }
    const declared = manifest.dsh?.bundle?.patch
    if (typeof declared === 'string' && declared !== '') {
      collectInsertIds(join(packageDir, declared))
    }
  } catch { /* 未安装或无 manifest */ }
  // 2. 惯例位置
  collectInsertIds(join(packageDir, 'cordis.patch.yml'))

  // 3. loader 当前 entry。prefix 取与 locateProfile 相同的 include 层
  //（第一个读 cordis.yml 的 entry），避免多层 include 时两者口径不一。
  let prefix = ''
  for (const entry of ctx.loader.entries()) {
    const opts = entry.options
    if (opts?.name !== 'cordis:include' || typeof opts.id !== 'string') continue
    if (typeof opts.config?.path !== 'string' || !opts.config.path.endsWith('cordis.yml')) continue
    prefix = `${opts.id}:`
    break
  }
  for (const entry of ctx.loader.entries()) {
    if (entry.options?.name !== packageName) continue
    let id = entry.options?.id ?? ''
    if (id === '') continue
    if (prefix !== '' && id.startsWith(prefix)) id = id.slice(prefix.length)
    if (/^(?:mkt-|client-)/u.test(id)) continue
    ids.add(id)
  }
  return [...ids]
}
