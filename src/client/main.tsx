// dsh-plugin-mgr — client 侧装配点：注册词典与 settings.plugins.tab slot。
// UI 渲染入口为 PluginManagerTab；本模块只做服务接线。

import { getReact } from './runtime'
import type { ClientContext } from './types'
import { NS, zh, en } from './i18n'
import { ensureCss } from './styles'
import { PluginManagerTab } from './PluginManagerTab'

/** client 侧依赖：slots（注册 UI slot 的服务）+ locale（多语言词典） */
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  const React = getReact()
  ensureCss()
  // 注册 zh/en 词典；t 每次调用读取当前激活语言
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-mgr: dictionaries')
  const t = ctx.locale.bind(NS)

  // 官方插件设置页暴露的 tab slot：注册为「插件管理」子页面
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      {
        name: 'settings.plugins.tab',
        id: 'installed-manager',
        order: 20,
        label: () => t('tab'),
        locale: NS,
      },
      () => <PluginManagerTab t={t} locale={ctx.locale} />,
    ),
  )
}
