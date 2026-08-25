// dsh-plugin-mgr — client 入口：在 设置 → 插件 页面注入「插件管理」tab。
//
// 加载格式：window.__ModuleLoader__.load({ id, factory })，由构建脚本
//（scripts/build-client.mjs）把本目录 bundle 成单文件 dist/client.js，
// 并在尾部追加 load 调用。平台依赖（react / UI 原语）经 context.js 桥接。
//
// 模块结构：
//   context.js          平台 require 桥（React / hooks / UI 原语）
//   i18n.js             zh/en 词典 + fmt 占位替换
//   styles.js           CSS 注入
//   api.js              宿主 HTTP API 封装
//   toast.js            Toast 队列 hook + 渲染
//   PluginManagerTab.js tab 主组件（状态编排）
//   components/         Toolbar / PluginCard / ConfirmModal

import { bindPlatformRequire, h } from "./context.js";
import { NS, zh, en } from "./i18n.js";
import { PluginManagerTab } from "./PluginManagerTab.js";

/** client 侧依赖：slots（UI slot 注册）+ locale（多语言词典） */
export const inject = ["slots", "locale"];

/**
 * 插件应用入口。
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
    // 注册 zh/en 词典；t 每次调用读取当前激活语言
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-plugin-mgr: dictionaries");
    const t = ctx.locale.bind(NS);

    // 官方插件设置页暴露的 tab slot：注册为「插件管理」子页面
    ctx.slots.inject("settings.plugins.tab", () =>
        ctx.slots.register(
            {
                name: "settings.plugins.tab",
                id: "installed-manager",
                order: 20,
                label: () => t("tab"),
                locale: NS,
            },
            () => h(PluginManagerTab, { t, locale: ctx.locale })
        )
    );
}

/**
 * ModuleLoader 工厂入口：绑定平台 require 后返回插件接口。
 * 由 dist/client.js 尾部的 load 调用触发。
 */
export function boot(platformRequire) {
    bindPlatformRequire(platformRequire);
    return { apply, inject };
}
