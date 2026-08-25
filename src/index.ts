// dsh-plugin-mgr — 已安装插件管理：设置 → 插件 → 「已安装管理」tab。
//
// 本文件只是入口：声明插件元数据、聚合单测导出、注册 HTTP 路由。
// 业务实现按职责拆在 server/ 下：
//   paths.ts       profile / 用户补丁层定位
//   patch-layer.ts 补丁层逐行读写（启停的落盘机制）
//   rows.ts        每个包拥有的补丁行 id
//   lifecycle.ts   调 dsh CLI 子进程（卸载/更新）
//   fiber-watch.ts 运行失败捕获（fiber FAILED 归因到包）
//   registry.ts    npm registry 更新检查（semver / .npmrc / packument）
//   inspect.ts     已安装列表组装
//   http.ts        JSON 收发与参数校验
//
// 启停机制：profile 的用户补丁层支持逐行 `disabled: true/false` 覆盖，
// 写入后 HMR 约 1s 内重新组合插件树，状态跨重启保留。

import type { Context } from '@deepseek-ai/cordis'
import { API } from './shared/api-paths.js'
import { locateProfile } from './server/paths.js'
import {
  readUserPatchState,
  appendPatchEntry,
  prepareAppend,
  rowBlock,
  withPlaceholderRestored,
  escapeRegExp,
  disableRows,
  enableRows,
  removeRowBlocks,
} from './server/patch-layer.js'
import { runDshPlugin, failureText } from './server/lifecycle.js'
import { watchFiberFailures } from './server/fiber-watch.js'
import { latestCache, collectUpdates, parseNpmrcRegistry, compareSemver, publishTimeOf } from './server/registry.js'
import { listPlugins, cleanRepoUrl, sourceTypeOf } from './server/inspect.js'
import { sendJson, readJsonBody, isValidPackageName } from './server/http.js'
import type { PluginRow } from './server/types.js'

export const name = 'dsh-plugin-mgr'
export const inject = ['webServer', 'loader']

/** 内部纯逻辑导出：仅供单测（test/）使用，不属于插件对外 API。 */
export const _internal = {
  readUserPatchState,
  appendPatchEntry,
  prepareAppend,
  rowBlock,
  withPlaceholderRestored,
  escapeRegExp,
  disableRows,
  enableRows,
  removeRowBlocks,
  cleanRepoUrl,
  sourceTypeOf,
  parseNpmrcRegistry,
  compareSemver,
  failureText,
  publishTimeOf,
}

export function apply(ctx: Context) {
  const logger = ctx.logger(name)
  watchFiberFailures(ctx)

  // GET /list —— 列出 profile 中已安装插件 + 启停状态
  ctx.webServer.register({
    kind: 'exact',
    path: API.list,
    handler: (_req, res) => {
      try {
        sendJson(res, 200, { ok: true, ...listPlugins(ctx) })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: `读取已安装插件失败：${(e as Error).message}` })
      }
    },
  })

  // POST /toggle —— 启用/停用一个插件（写 profile 的用户补丁层）
  ctx.webServer.register({
    kind: 'exact',
    path: API.toggle,
    handler: async (req, res) => {
      let body: Record<string, unknown>
      try {
        body = await readJsonBody(req)
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: (e as Error).message })
      }
      const pkg = body.name
      const disable = body.disable
      if (typeof pkg !== 'string' || typeof disable !== 'boolean') {
        return sendJson(res, 400, { ok: false, error: '参数错误：需要 { name: string, disable: boolean }' })
      }
      let patchPath: string
      let profile: string
      let current: PluginRow | undefined
      try {
        ;({ patchPath, profile } = locateProfile(ctx))
        current = listPlugins(ctx).plugins.find((p) => p.name === pkg)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: `读取已安装插件失败：${(e as Error).message}` })
      }
      if (current === undefined) return sendJson(res, 404, { ok: false, error: `未找到插件 ${pkg}` })
      if (current.protected) return sendJson(res, 400, { ok: false, error: `${pkg} 是宿主基础设施，不允许启停` })
      if (current.self) return sendJson(res, 400, { ok: false, error: '不能停用插件管理器自身（停用后无人再把它启用）' })
      if (current.rows.length === 0) {
        return sendJson(res, 400, { ok: false, error: `${pkg} 没有可控制的补丁行（纯 client 插件不支持补丁层启停）` })
      }
      const result = disable
        ? await disableRows(patchPath, current.rows)
        : await enableRows(patchPath, current.rows)
      if (!result.ok) return sendJson(res, 500, { ok: false, error: result.reason })
      logger.info(`${disable ? 'disabled' : 'enabled'} ${pkg} in profile ${profile} (patch layer, HMR applies in ~1s)`)
      sendJson(res, 200, { ok: true, name: pkg, disabled: disable })
    },
  })

  // POST /uninstall —— 清理补丁层后调 dsh plugin remove
  ctx.webServer.register({
    kind: 'exact',
    path: API.uninstall,
    handler: async (req, res) => {
      let body: Record<string, unknown>
      try {
        body = await readJsonBody(req)
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: (e as Error).message })
      }
      const pkg = body.name
      if (!isValidPackageName(pkg)) {
        return sendJson(res, 400, { ok: false, error: '参数错误：包名格式非法' })
      }
      let patchPath: string
      let profile: string
      let current: PluginRow | undefined
      try {
        ;({ patchPath, profile } = locateProfile(ctx))
        current = listPlugins(ctx).plugins.find((p) => p.name === pkg)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: `读取已安装插件失败：${(e as Error).message}` })
      }
      if (current === undefined) return sendJson(res, 404, { ok: false, error: `未找到插件 ${pkg}` })
      if (current.protected) return sendJson(res, 400, { ok: false, error: `${pkg} 是宿主基础设施，不允许卸载` })
      if (current.self && !body.selfConfirm) {
        return sendJson(res, 400, { ok: false, error: '卸载自身需要 selfConfirm: true（面板已自动携带）' })
      }
      // 先清理补丁层启停行，再让 dsh CLI 移除依赖与 bundle。
      // CLI 运行期间新到的 toggle 请求可能又写回启停行，成功后再清一次兜底。
      await removeRowBlocks(patchPath, current.rows)
      const result = await runDshPlugin(profile, ['remove', pkg])
      if (result.code !== 0) {
        return sendJson(res, 500, { ok: false, error: `dsh plugin remove 失败（exit ${result.code}）：${result.output.slice(-1500)}` })
      }
      await removeRowBlocks(patchPath, current.rows)
      logger.info(`uninstalled ${pkg} from profile ${profile}`)
      sendJson(res, 200, { ok: true, name: pkg, output: result.output.slice(-500) })
    },
  })

  // GET /updates —— npm 来源插件的可更新信息
  ctx.webServer.register({
    kind: 'exact',
    path: API.updates,
    handler: async (_req, res) => {
      try {
        const updates = await collectUpdates(ctx)
        sendJson(res, 200, { ok: true, updates })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: `检查插件更新失败：${(e as Error).message}` })
      }
    },
  })

  // POST /update —— 更新到 latest
  ctx.webServer.register({
    kind: 'exact',
    path: API.update,
    handler: async (req, res) => {
      let body: Record<string, unknown>
      try {
        body = await readJsonBody(req)
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: (e as Error).message })
      }
      const pkg = body.name
      if (!isValidPackageName(pkg)) {
        return sendJson(res, 400, { ok: false, error: '参数错误：包名格式非法' })
      }
      let patchPath: string
      let profile: string
      let current: PluginRow | undefined
      try {
        ;({ patchPath, profile } = locateProfile(ctx))
        current = listPlugins(ctx).plugins.find((p) => p.name === pkg)
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: `读取已安装插件失败：${(e as Error).message}` })
      }
      if (current === undefined) return sendJson(res, 404, { ok: false, error: `未找到插件 ${pkg}` })
      if (current.protected) return sendJson(res, 400, { ok: false, error: `${pkg} 是宿主基础设施，不允许更新` })
      if (current.sourceType !== 'npm') {
        return sendJson(res, 400, { ok: false, error: `${pkg} 不是 npm 来源，请通过原始安装来源更新` })
      }
      if (current.self && !body.selfConfirm) {
        return sendJson(res, 400, { ok: false, error: '更新自身需要 selfConfirm: true（面板已自动携带）' })
      }
      const wasDisabled = current.disabled
      const expectedLatest = latestCache.get(pkg)?.latest ?? null
      const result = await runDshPlugin(profile, ['add', `${pkg}@latest`])
      if (result.code !== 0) {
        return sendJson(res, 500, { ok: false, error: `dsh plugin add 失败（exit ${result.code}）：${result.output.slice(-1500)}` })
      }
      // add 重铺 bundle 补丁行后，若更新前是停用状态，重读行并重新断言停用，
      // 避免更新把用户的启停选择冲掉。disableRows 幂等，已是停用则不动文件。
      try {
        const fresh = listPlugins(ctx).plugins.find((p) => p.name === pkg)
        if (fresh !== undefined && wasDisabled && !fresh.disabled) {
          await disableRows(patchPath, fresh.rows)
        }
      } catch { /* 刷新失败不影响更新结果 */ }
      latestCache.delete(pkg)
      // pnpm 的 minimumReleaseAge 供应链门禁会静默跳过「发布过新」的版本，
      // 以 exit 0 + Already up to date 收场——exit 码不代表真装上了。
      // 以磁盘实际版本对账，如实告诉前端。
      let installed: string | null = null
      try {
        installed = listPlugins(ctx).plugins.find((p) => p.name === pkg)?.version ?? null
      } catch { /* 读取失败按未知处理 */ }
      const updated =
        installed !== null && installed !== '-' &&
        (expectedLatest !== null ? installed === expectedLatest : installed !== current.version)
      logger.info(`updated ${pkg} to ${installed ?? '?'} in profile ${profile}`)
      sendJson(res, 200, {
        ok: true, name: pkg, version: installed,
        expected: expectedLatest, updated,
        output: result.output.slice(-500),
      })
    },
  })

  logger.info(
    `ready — routes GET ${API.list}, GET ${API.updates}, ` +
      `POST ${API.toggle}, POST ${API.uninstall}, POST ${API.update}`,
  )
}
