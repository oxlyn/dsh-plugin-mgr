// dsh-plugin-mgr — client 模块：在 设置 → 插件 页面注入「插件管理」tab。
//
// 格式：window.__ModuleLoader__.load({ id, factory: (require) => {...} })
// 通过 settings.plugins.tab slot 注册子 tab（官方插件设置页暴露的扩展点）。
//
// 多语言：通过官方 locale 服务注册 zh/en 词典（与 dshmarket 同模式），
// 语言跟随 harness 设置（设置 → 通用 → 语言），切换语言即时生效。
//
// 设计语言对齐 DSH 官方设置卡片（ui-settings-plugins 的 Card.module.css）：
// bg-layer-3 卡面 + border-l2 1px 边框 + 12px 圆角 + .16s 过渡 + hover 提亮边框；
// 展开态（cardOpen）切 bg-layer-2 并提亮边框。卡片行：图标 + 名称 + 状态文本 +
// switch；点箭头展开详情（版本 / 安装来源 / 插件介绍 / 卸载按钮）。
//
window.__ModuleLoader__.load({
    id: "dsh-plugin-mgr",
    factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;

        const React = require("react");
        const { useState, useEffect, useCallback } = React;

        // 宿主平台模块（冻结表，dshmarket 同款确认框）。老宿主没有时
        // require 抛错，回退 window.confirm 原生确认框。
        let Modal = null, Button = null;
        try {
            const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
            Modal = primitives.Modal;
            Button = primitives.Button;
        } catch { /* 平台模块不存在：hasModal 为 false，走原生确认 */ }
        const hasModal = typeof Modal === "function" && typeof Button === "function";

        // ── 多语言词典（locale 服务，语言跟随 harness）─────────────────────────
        const NS = "dsh-plugin-mgr";
        const zh = {
            tab: "插件管理",
            meta: "profile：{0} ｜ 共 {1} 个插件",
            refresh: "刷新",
            refreshing: "刷新中…",
            refreshedAt: "列表已刷新 · {0}",
            col1: "单列显示",
            col2: "双列显示",
            layoutGroup: "列表布局",
            searchPlaceholder: "搜索名称 / 描述…",
            searchAria: "搜索插件",
            metaFiltered: "profile：{0} ｜ {1} / {2} 个插件",
            emptyFiltered: "没有匹配的插件。",
            clearFilters: "清除搜索",
            stateOn: "运行中",
            stateOff: "已停止",
            stateError: "加载失败",
            errorField: "错误信息",
            toggleOn: "点击停用（HMR 约 1s 生效）",
            toggleOff: "点击启用（HMR 约 1s 生效）",
            selfHint: "本插件",
            protectedToggle: "宿主基础设施，不允许启停",
            clientOnlyToggle: "纯 client 插件，无补丁行可控制",
            switchAria: "{0} 启用状态",
            collapse: "收起详情",
            expand: "展开详情",
            version: "版本",
            source: "安装来源",
            sourceNpm: "npm",
            sourceGithub: "GitHub",
            sourceLocal: "本地",
            description: "插件介绍",
            noDescription: "（未提供介绍）",
            uninstall: "卸载",
            uninstalling: "卸载中…",
            uninstallTitle: "从 profile 移除该插件包",
            protectedUninstall: "受保护的宿主模块",
            updateAvailable: "可更新",
            latestVersion: "最新版本",
            latestVersionTitle: "最新版本 v{0}",
            publishedAt: "发布于 {0}",
            update: "更新",
            updating: "更新中…",
            updateTitle: "更新到最新版本（npm registry）",
            confirmUpdate: "确定更新 {0} 到 v{1}？",
            confirmUpdateSelf: "注意：这是插件管理器自己，更新期间本页面可能短暂失效。",
            updatedMsg: "{0} 已更新到 v{1}",
            updateFail: "{0} 更新失败：{1}",
            updateSkipped: "{0} 仍为 v{1}：pnpm 供应链策略（minimumReleaseAge）可能静默跳过了发布过新的版本——稍后重试，或先装精确版本",
            empty: "该 profile 尚未安装任何插件。",
            loading: "加载中...",
            loadError: "读取已安装插件失败：",
            retry: "重试",
            disabledMsg: "{0} 已停止，约 1s 内生效（HMR）",
            enabledMsg: "{0} 已启动，约 1s 内生效（HMR）",
            toggleFail: "{0} 切换失败：{1}",
            uninstalledMsg: "{0} 已卸载",
            uninstallFail: "{0} 卸载失败：{1}",
            confirmUninstall: "确定卸载 {0}@{1}？",
            confirmUninstallNoVer: "确定卸载 {0}？",
            confirmSelf: "注意：这是插件管理器自己，卸载后本页面将消失。",
            cancel: "取消",
        };
        const en = {
            tab: "Plugin Manager",
            meta: "profile: {0} ｜ {1} plugin(s)",
            refresh: "Refresh",
            refreshing: "Refreshing…",
            refreshedAt: "Refreshed · {0}",
            col1: "Single column",
            col2: "Two columns",
            layoutGroup: "List layout",
            searchPlaceholder: "Search name / description…",
            searchAria: "Search plugins",
            metaFiltered: "profile: {0} ｜ {1} / {2} plugin(s)",
            emptyFiltered: "No matching plugins.",
            clearFilters: "Clear search",
            stateOn: "Running",
            stateOff: "Stopped",
            stateError: "Load failed",
            errorField: "Error",
            toggleOn: "Click to disable (HMR ~1s)",
            toggleOff: "Click to enable (HMR ~1s)",
            selfHint: "This plugin",
            protectedToggle: "Host infrastructure, cannot be toggled",
            clientOnlyToggle: "Client-only plugin, no patch rows to control",
            switchAria: "{0} enabled state",
            collapse: "Collapse details",
            expand: "Expand details",
            version: "Version",
            source: "Source",
            sourceNpm: "npm",
            sourceGithub: "GitHub",
            sourceLocal: "Local",
            description: "Description",
            noDescription: "(no description)",
            uninstall: "Uninstall",
            uninstalling: "Uninstalling…",
            uninstallTitle: "Remove this package from the profile",
            protectedUninstall: "Protected host module",
            updateAvailable: "Update",
            latestVersion: "Latest",
            latestVersionTitle: "Latest version v{0}",
            publishedAt: "Published {0}",
            update: "Update",
            updating: "Updating…",
            updateTitle: "Update to the latest version (npm registry)",
            confirmUpdate: "Update {0} to v{1}?",
            confirmUpdateSelf: "Note: this is the plugin manager itself; this page may briefly go down during the update.",
            updatedMsg: "{0} updated to v{1}",
            updateFail: "Failed to update {0}: {1}",
            updateSkipped: "{0} is still v{1}: the pnpm supply-chain policy (minimumReleaseAge) may have silently skipped a too-fresh release — retry later, or install an exact version first",
            empty: "No plugins installed in this profile.",
            loading: "Loading...",
            loadError: "Failed to load installed plugins: ",
            retry: "Retry",
            disabledMsg: "{0} disabled, takes effect in ~1s (HMR)",
            enabledMsg: "{0} enabled, takes effect in ~1s (HMR)",
            toggleFail: "Failed to toggle {0}: {1}",
            uninstalledMsg: "{0} uninstalled",
            uninstallFail: "Failed to uninstall {0}: {1}",
            confirmUninstall: "Uninstall {0}@{1}?",
            confirmUninstallNoVer: "Uninstall {0}?",
            confirmSelf: "Note: this is the plugin manager itself; this page will disappear after uninstalling.",
            cancel: "Cancel",
        };

        // ── 样式表（一次性注入；类名 dshpm- 前缀隔离）────────────────────────
        const CSS = `
/* 宿主 tab 标题栏固定 */
[role="tablist"] { position:sticky; top:0; z-index:20; background:var(--dshpm-bg, var(--dsw-alias-bg-module-platform, #f5f5f5)); padding-top:8px; margin-top:-8px; }
.dshpm-root { color:var(--dsw-alias-label-primary,#333); }
.dshpm-sticky { position:sticky; top:44px; z-index:10; background:var(--dshpm-bg, var(--dsw-alias-bg-module-platform, #f5f5f5)); padding-bottom:8px; }
.dshpm-toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.dshpm-meta { font-size:13px; color:var(--dsw-alias-label-tertiary,#888); margin-right:auto; }
.dshpm-seg { display:inline-flex; border:1px solid var(--dsw-alias-border-l2,#ddd); border-radius:8px; overflow:hidden; }
.dshpm-seg-btn { border:none; background:transparent; padding:4px 10px; font-size:12px; line-height:18px; cursor:pointer; color:var(--dsw-alias-label-tertiary,#888); transition:color .16s,background .16s; display:inline-flex; align-items:center; justify-content:center; }
.dshpm-seg-btn:hover { color:var(--dsw-alias-label-primary,#333); }
.dshpm-seg-btn.is-active { background:var(--dsw-alias-button-primary-fill,#4f46e5); color:var(--dsw-alias-label-primary-foreground,#fff); }
.dshpm-seg-btn svg { width:14px; height:14px; display:block; }
/* 搜索框与筛选下拉：与分段按钮同高（12px 字号 + 4px 纵向内边距），主题变量配色 */
/* 搜索框配色对齐宿主「插件列表」搜索框：bg-layer-1 底 + 聚焦时业务色描边 */
.dshpm-search input[type="search"] { box-sizing:border-box; width:190px; border:1px solid var(--dsw-alias-border-l2,#ddd); border-radius:8px; background:var(--dsw-alias-bg-layer-1,#f5f5f5); color:var(--dsw-alias-label-primary,#333); font-size:12px; line-height:18px; padding:4px 10px; outline:none; transition:border-color .16s,box-shadow .16s; }
.dshpm-search input[type="search"]:focus { border-color:var(--dsw-alias-state-business-primary,#1967d2); box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary,#1967d2) 18%, transparent); }
.dshpm-search input[type="search"]::placeholder { color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-search input[type="search"]::-webkit-search-cancel-button { cursor:pointer; }
/* 两按钮之间的分隔竖线。span 默认 inline、width 不生效，必须显式 block；
   1px 在部分渲染下过细，用 2px + label-dimmed 保证可见 */
.dshpm-seg-divider { display:block; width:2px; align-self:stretch; background:var(--dsw-alias-label-dimmed,#999); }
.dshpm-list { display:grid; grid-template-columns:minmax(0,1fr); align-items:start; gap:10px; list-style:none; margin:0; padding:0; }
.dshpm-root.is-cols-2 .dshpm-list { grid-template-columns:repeat(2, minmax(0,1fr)); }
/* 单列时横条更扁：收紧行距 + 缩小图标 */
.dshpm-root:not(.is-cols-2) .dshpm-row { padding:7px 16px; }
.dshpm-root:not(.is-cols-2) .dshpm-icon { width:28px; height:28px; border-radius:8px; }
.dshpm-root:not(.is-cols-2) .dshpm-icon svg { width:15px; height:15px; }
/* 双列下卡片更紧凑：隐藏状态文字（switch 已表达状态）和插件图标，给名称留足空间 */
.dshpm-root.is-cols-2 .dshpm-state { display:none; }
.dshpm-root.is-cols-2 .dshpm-icon { display:none; }
.dshpm-root.is-cols-2 .dshpm-row { padding:10px 14px; gap:10px; }
.dshpm-root.is-cols-2 .dshpm-detail { padding:8px 14px 12px 14px; }
.dshpm-card { display:flex; flex-direction:column; border:1px solid var(--dsw-alias-border-l2,#e2e2e2); background:var(--dsw-alias-bg-layer-3,#fff); border-radius:12px; transition:border-color .16s,background .16s; }
.dshpm-card:hover { border-color:var(--dsw-alias-label-dimmed,#999); }
.dshpm-card.is-open { background:var(--dsw-alias-bg-layer-2,#fafafa); border-color:var(--dsw-alias-label-dimmed,#999); }
.dshpm-row { display:flex; align-items:center; gap:12px; padding:12px 16px; cursor:pointer; user-select:none; min-width:0; }
.dshpm-arrow { flex:none; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--dsw-alias-label-tertiary,#888); transition:transform .16s,color .16s; }
.dshpm-arrow:hover { color:var(--dsw-alias-label-primary,#333); }
.dshpm-arrow.is-open { transform:rotate(180deg); }
.dshpm-arrow svg { width:14px; height:14px; display:block; }
.dshpm-icon { width:36px; height:36px; border-radius:10px; flex:none; display:flex; align-items:center; justify-content:center; color:var(--dsw-alias-label-secondary,#555); transition:opacity .16s; }
.dshpm-icon svg { width:18px; height:18px; display:block; }
.dshpm-card.is-off .dshpm-icon { opacity:.5; }
.dshpm-name { font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary,#333); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshpm-card.is-off .dshpm-name { color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-actions { margin-left:auto; display:flex; align-items:center; gap:12px; flex:none; }
.dshpm-state { font-size:11px; line-height:17px; white-space:nowrap; color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-state.is-on { color:var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-state.is-err { color:var(--dsw-alias-state-error-primary,#d32f2f); font-weight:600; }
/* 小圆角标签：来源分类（中性）与「可更新」徽标（信息蓝）共用底样式 */
.dshpm-pill { display:inline-flex; align-items:center; padding:0 8px; border:1px solid var(--dsw-alias-border-l2,#ddd); border-radius:999px; font-size:11px; line-height:17px; white-space:nowrap; color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-pill.is-update { color:var(--dsw-alias-state-info-primary,#1967d2); border-color:var(--dsw-alias-state-info-primary,#1967d2); }
/* 最新版本行里跟在版本号后的发布时间（弱化色，非等宽） */
.dshpm-published { color:var(--dsw-alias-label-tertiary,#888); font-family:inherit; font-weight:400; }
.dshpm-switch { display:inline-block; box-sizing:border-box; width:36px; height:20px; border-radius:10px; padding:2px; cursor:pointer; background:var(--dsw-alias-label-tertiary,#888); transition:background .16s; flex:none; }
.dshpm-switch.is-on { background:var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-switch.is-busy { opacity:.5; cursor:wait; }
.dshpm-switch.is-frozen { opacity:.4; cursor:not-allowed; }
.dshpm-knob { display:block; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:transform .16s; }
.dshpm-switch.is-on .dshpm-knob { transform:translateX(16px); }
.dshpm-detail { border-top:1px solid var(--dsw-alias-border-l2,#eee); padding:10px 16px 14px 48px; display:flex; flex-direction:column; gap:4px; }
.dshpm-field { display:flex; gap:10px; font-size:12px; line-height:1.6; }
.dshpm-field-key { flex:none; width:60px; color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-field-val { color:var(--dsw-alias-label-primary,#333); word-break:break-all; min-width:0; }
.dshpm-field-val.is-code { font-family:var(--ds-font-family-code,monospace); }
.dshpm-repo-link { color:var(--dsw-alias-state-info-primary,#1967d2); text-decoration:none; font-size:12px; word-break:break-all; }
.dshpm-repo-link:hover { text-decoration:underline; }
.dshpm-detail-actions { display:flex; justify-content:flex-end; align-items:center; gap:16px; margin-top:8px; }
.dshpm-btn { border-radius:8px; padding:5px 14px; font-size:13px; line-height:1.5; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#ddd); color:var(--dsw-alias-label-secondary,#555); background:transparent; white-space:nowrap; transition:color .16s,border-color .16s,background .16s; }
.dshpm-btn:hover:not(:disabled) { color:var(--dsw-alias-label-primary,#333); border-color:var(--dsw-alias-label-dimmed,#999); }
.dshpm-btn:disabled { opacity:.5; cursor:not-allowed; }
.dshpm-btn-danger { color:var(--dsw-alias-state-error-primary,#d32f2f); border-color:var(--dsw-alias-state-error-primary,#d32f2f); }
.dshpm-btn-danger:hover:not(:disabled) { color:var(--dsw-alias-state-error-primary,#d32f2f); border-color:var(--dsw-alias-state-error-primary,#d32f2f); background:var(--dsw-alias-state-error-bg,#fce8e6); }
/* 更新按钮：信息蓝（与「可更新」徽标同色系），与右侧卸载按钮拉开间距 */
.dshpm-btn-update { color:var(--dsw-alias-state-info-primary,#1967d2); border-color:var(--dsw-alias-state-info-primary,#1967d2); }
.dshpm-btn-update:hover:not(:disabled) { color:var(--dsw-alias-state-info-primary,#1967d2); border-color:var(--dsw-alias-state-info-primary,#1967d2); background:var(--dsw-alias-state-info-bg,#e8f0fe); }
.dshpm-banner { font-size:12px; line-height:1.6; padding:8px 12px; border-radius:8px; word-break:break-all; }
.dshpm-banner-ok { background:var(--dsw-alias-state-success-bg,#e6f4ea); color:var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-banner-err { background:var(--dsw-alias-state-error-bg,#fce8e6); color:var(--dsw-alias-state-error-primary,#d32f2f); white-space:pre-wrap; }
/* Toast 通知容器：固定在视口正中央，不随页面滚动 */
.dshpm-toast-container { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:10000; display:flex; flex-direction:column-reverse; gap:8px; pointer-events:none; align-items:center; }
.dshpm-toast { pointer-events:auto; font-size:13px; line-height:1.5; padding:10px 16px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,.15); word-break:break-all; max-width:360px; animation:dshpm-toast-in .3s ease-out; transition:opacity .3s,transform .3s; }
.dshpm-toast.is-leaving { opacity:0; transform:translateY(10px); }
.dshpm-toast-ok { background:var(--dsw-alias-state-success-bg,#e6f4ea); color:var(--dsw-alias-state-success-primary,#1e8e3e); border:1px solid var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-toast-err { background:var(--dsw-alias-state-error-bg,#fce8e6); color:var(--dsw-alias-state-error-primary,#d32f2f); border:1px solid var(--dsw-alias-state-error-primary,#d32f2f); white-space:pre-wrap; display:flex; align-items:flex-start; gap:12px; }
.dshpm-toast-close { flex:none; width:18px; height:18px; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:.6; transition:opacity .16s; border:none; background:transparent; padding:0; color:inherit; }
.dshpm-toast-close:hover { opacity:1; }
.dshpm-toast-close svg { width:14px; height:14px; display:block; }
@keyframes dshpm-toast-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
.dshpm-empty { padding:40px 16px; text-align:center; color:var(--dsw-alias-label-tertiary,#999); border:1px dashed var(--dsw-alias-border-l2,#e2e2e2); border-radius:12px; font-size:13px; }
.dshpm-loading { padding:32px 0; text-align:center; color:var(--dsw-alias-label-tertiary,#999); font-size:13px; }
.dshpm-hint { font-size:12px; color:var(--dsw-alias-label-tertiary,#888); }
`;

        function ensureCss() {
            const id = "dsh-plugin-mgr-style";
            if (document.getElementById(id)) return;
            const el = document.createElement("style");
            el.id = id;
            el.textContent = CSS;
            document.head.appendChild(el);
        }

        /** {0}/{1} 占位替换 */
        function fmt(s, ...args) {
            return args.reduce((acc, v, i) => acc.replace(`{${i}}`, String(v)), s);
        }

        /**
         * 「插件管理」tab 组件。
         * 手风琴卡片：行内常显 名称 + 状态文本 + switch；点箭头（或行）展开详情：
         * 版本 / 安装来源 / 插件介绍 / 卸载按钮（点击二次确认）。
         * props: { t, locale } — t 为绑定了词典命名空间的翻译函数，
         * locale 用于订阅语言变化触发重渲染。
         */
        function PluginManagerTab({ t, locale }) {
            const [state, setState] = useState({ loading: true, error: null, data: null });
            // 单行操作进行中：{ [name]: 'toggle' | 'uninstall' }
            const [pending, setPending] = useState({});
            // Toast 通知队列：{ id, type, text, leaving }
            const [toasts, setToasts] = useState([]);
            const toastIdRef = React.useRef(0);
            // 手动刷新反馈：记录刷新完成时间，短暂显示"已刷新"横幅
            const [refreshedAt, setRefreshedAt] = useState(null);
            // 展开状态：{ [name]: boolean }
            const [expanded, setExpanded] = useState({});
            // 待确认操作（模态框）：null | { kind: 'uninstall' | 'update', row }
            const [confirming, setConfirming] = useState(null);
            // 列表布局：1 = 单列，2 = 双列（localStorage 持久化）
            const COLUMNS_KEY = "dsh-plugin-mgr:columns";
            const [columns, setColumns] = useState(() => {
                try {
                    const raw = localStorage.getItem(COLUMNS_KEY);
                    return raw === "2" ? 2 : 1;
                } catch {
                    return 1;
                }
            });
            // 语言切换时强制重渲染（t 每次调用读取当前激活词典）
            const [localeTick, setLocaleTick] = useState(0);
            // 更新检查结果：{ [name]: { latest, update } }（列表加载后异步补充）
            const [updates, setUpdates] = useState({});
            // 搜索（内存态：匹配 名称/描述/spec，不区分大小写）
            const [query, setQuery] = useState("");

            useEffect(() => {
                ensureCss();
                // 读取页面最上方「插件」标题区域的实际背景色：
                // 标题本身通常透明，故从标题元素起沿祖先向上找第一个不透明背景，
                // 写入 --dshpm-bg 供 sticky 元素使用（注意不能读 tablist 自身——
                // 我们的 CSS 已给它设置了背景，会读到自己的回退值）。
                // 主题切换（body[data-ds-dark-theme] / .dark / 系统偏好）时重读，
                // 否则缓存的固定色值不跟随主题翻转，深浅色下显示异常。
                const syncBgColor = () => {
                    // 等一帧让宿主样式按新主题完成重算后再读取
                    requestAnimationFrame(() => {
                        const rootEl = document.querySelector(".dshpm-root");
                        const section = rootEl ? rootEl.closest("section, [class*='section']") : null;
                        const anchor =
                            section?.querySelector("h1, h2, h3") ||
                            document.querySelector("[role='tablist']") ||
                            rootEl;
                        let el = anchor;
                        while (el && el !== document.documentElement) {
                            const bg = getComputedStyle(el).backgroundColor;
                            if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
                                document.documentElement.style.setProperty("--dshpm-bg", bg);
                                return;
                            }
                            el = el.parentElement;
                        }
                    });
                };
                syncBgColor();
                // 宿主通过 body[data-ds-dark-theme] 属性 + .dark 类切换主题，
                // 观察两者变化；再兜底监听系统深浅色偏好（跟随系统模式）
                const observer = new MutationObserver(syncBgColor);
                observer.observe(document.body, {
                    attributes: true,
                    attributeFilter: ["class", "data-ds-dark-theme", "style"],
                });
                const mql = window.matchMedia("(prefers-color-scheme: dark)");
                mql.addEventListener("change", syncBgColor);
                return () => {
                    observer.disconnect();
                    mql.removeEventListener("change", syncBgColor);
                };
            }, []);

            // 添加 toast 通知；成功自动 4s 消失，失败需手动关闭
            const addToast = useCallback((type, text) => {
                const id = ++toastIdRef.current;
                setToasts((prev) => [...prev, { id, type, text, leaving: false }]);
                // 成功通知自动消失
                if (type === "ok") {
                    setTimeout(() => {
                        setToasts((prev) => prev.map((t) => t.id === id ? { ...t, leaving: true } : t));
                    }, 3500);
                    setTimeout(() => {
                        setToasts((prev) => prev.filter((t) => t.id !== id));
                    }, 4000);
                }
            }, []);

            // 手动关闭 toast
            const dismissToast = useCallback((id) => {
                setToasts((prev) => prev.map((t) => t.id === id ? { ...t, leaving: true } : t));
                setTimeout(() => {
                    setToasts((prev) => prev.filter((t) => t.id !== id));
                }, 300);
            }, []);

            useEffect(() => {
                if (!locale || typeof locale.subscribe !== "function") return;
                return locale.subscribe(() => setLocaleTick((n) => n + 1));
            }, [locale]);

            const changeColumns = (n) => {
                setColumns(n);
                try {
                    localStorage.setItem(COLUMNS_KEY, String(n));
                } catch { /* ignore */ }
            };

            const clearFilters = () => {
                setQuery("");
            };

            // loadData(silent)：silent=true 用于首次/自动加载（不弹反馈）；
            // silent=false 由刷新按钮触发，完成后短暂显示"已刷新"横幅
            const loadData = useCallback(async (silent) => {
                setState((s) => ({ ...s, loading: true, error: null }));
                try {
                    const resp = await fetch("/api/plugin-manager/list", { cache: "no-store" });
                    const json = await resp.json();
                    if (!json.ok) throw new Error(json.error || "unknown error");
                    setState({ loading: false, error: null, data: json });
                    if (!silent) setRefreshedAt(new Date());
                } catch (e) {
                    // 保留已有列表：刷新失败只在列表上方横幅提示，不整页退化为错误屏
                    setState((s) => ({ ...s, loading: false, error: e.message }));
                }
            }, []);

            useEffect(() => {
                loadData(true);
            }, [loadData]);

            // 刷新横幅 2.5s 后自动消失
            useEffect(() => {
                if (refreshedAt === null) return;
                const timer = setTimeout(() => setRefreshedAt(null), 2500);
                return () => clearTimeout(timer);
            }, [refreshedAt]);

            // 更新检查：跟随列表加载静默拉取；失败静默保留旧结果（host 侧有 5min 缓存）
            const fetchUpdates = useCallback(async () => {
                try {
                    const resp = await fetch("/api/plugin-manager/updates", { cache: "no-store" });
                    const json = await resp.json();
                    if (!json.ok) return;
                    setUpdates(json.updates || {});
                } catch { /* 静默：检查失败只是不显示徽标 */ }
            }, []);

            useEffect(() => {
                if (state.data) fetchUpdates();
            }, [state.data, fetchUpdates]);

            async function post(path, body) {
                const resp = await fetch(path, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    cache: "no-store",
                });
                const json = await resp.json().catch(() => ({ ok: false, error: `HTTP ${resp.status}` }));
                if (!json.ok) throw new Error(json.error || `HTTP ${resp.status}`);
                return json;
            }

            const clearPending = (name) => setPending((s) => {
                const next = { ...s };
                delete next[name];
                return next;
            });

            const toggleExpand = (name) => {
                setExpanded((s) => ({ ...s, [name]: !s[name] }));
            };

            const toggle = async (row) => {
                const disable = !row.disabled; // 当前启用 → 停止；当前停止 → 启动
                setPending((s) => ({ ...s, [row.name]: "toggle" }));
                try {
                    await post("/api/plugin-manager/toggle", { name: row.name, disable });
                    addToast("ok", fmt(disable ? t("disabledMsg") : t("enabledMsg"), row.name));
                    // HMR 重新组合约需 1s，稍等后刷新状态
                    setTimeout(() => {
                        clearPending(row.name);
                        loadData();
                    }, 1300);
                } catch (e) {
                    addToast("error", fmt(t("toggleFail"), row.name, e.message));
                    clearPending(row.name);
                }
            };

            const uninstall = async (row) => {
                setPending((s) => ({ ...s, [row.name]: "uninstall" }));
                try {
                    await post("/api/plugin-manager/uninstall", { name: row.name, selfConfirm: true });
                    addToast("ok", fmt(t("uninstalledMsg"), row.name));
                    setExpanded((s) => ({ ...s, [row.name]: false }));
                    loadData();
                } catch (e) {
                    addToast("error", fmt(t("uninstallFail"), row.name, e.message));
                } finally {
                    clearPending(row.name);
                }
            };

            const update = async (row) => {
                const info = updates[row.name];
                const latest = (info && info.latest) || "";
                setPending((s) => ({ ...s, [row.name]: "update" }));
                try {
                    const json = await post("/api/plugin-manager/update", { name: row.name, selfConfirm: true });
                    // updated=false：pnpm 供应链策略静默跳过（exit 0 但版本没变），如实提示
                    if (json.updated === false) {
                        addToast("error", fmt(t("updateSkipped"), row.name, json.version || row.version));
                    } else {
                        addToast("ok", fmt(t("updatedMsg"), row.name, json.version || latest));
                    }
                    await loadData(true);
                    fetchUpdates();
                } catch (e) {
                    addToast("error", fmt(t("updateFail"), row.name, e.message));
                } finally {
                    clearPending(row.name);
                }
            };

            // ── 确认门：有平台 Modal 走模态框（dshmarket 同款），否则原生 confirm ──
            const confirmUninstallText = (row) => {
                const self = row.self ? "\n\n" + t("confirmSelf") : "";
                // 版本未知（'-'，如 link 断链）时确认文案不显示 @-
                return (row.version !== "-"
                    ? fmt(t("confirmUninstall"), row.name, row.version)
                    : fmt(t("confirmUninstallNoVer"), row.name)) + self;
            };

            const beginUninstall = (row) => {
                if (!hasModal) {
                    if (!window.confirm(confirmUninstallText(row))) return;
                    uninstall(row);
                    return;
                }
                setConfirming({ kind: "uninstall", row });
            };

            const beginUpdate = (row) => {
                if (!hasModal) {
                    const info = updates[row.name];
                    const latest = (info && info.latest) || "";
                    const self = row.self ? "\n\n" + t("confirmUpdateSelf") : "";
                    if (!window.confirm(fmt(t("confirmUpdate"), row.name, latest) + self)) return;
                    update(row);
                    return;
                }
                setConfirming({ kind: "update", row });
            };

            const h = React.createElement;

            if (state.loading && !state.data) {
                return h("div", { className: "dshpm-root" },
                    h("div", { className: "dshpm-loading" }, t("loading"))
                );
            }
            // 全屏错误仅在从无到有加载失败时出现；已有数据时失败走横幅
            if (state.error && !state.data) {
                return h("div", { className: "dshpm-root" },
                    h("div", { className: "dshpm-banner dshpm-banner-err" },
                        t("loadError"), state.error
                    ),
                    h("div", null,
                        h("button", { className: "dshpm-btn", onClick: () => loadData(false) }, t("retry"))
                    )
                );
            }

            const data = state.data || { profile: "", plugins: [] };
            const plugins = data.plugins || [];

            // 搜索过滤：匹配 名称/描述/spec（大小写不敏感）
            const q = query.trim().toLowerCase();
            const hasFilter = q !== "";
            const visible = plugins.filter((row) => {
                if (q !== "" && !`${row.name}\n${row.description}\n${row.spec}`.toLowerCase().includes(q)) return false;
                return true;
            });

            return h("div", { className: `dshpm-root${columns === 2 ? " is-cols-2" : ""}` },
                h("div", { className: "dshpm-sticky" },
                    h("div", { className: "dshpm-toolbar" },
                    h("span", { className: "dshpm-meta" },
                        hasFilter
                            ? fmt(t("metaFiltered"), data.profile, visible.length, plugins.length)
                            : fmt(t("meta"), data.profile, plugins.length)
                    ),
                    // 搜索框：type=search 自带清除按钮
                    h("div", { className: "dshpm-search" },
                        h("input", {
                            type: "search",
                            value: query,
                            placeholder: t("searchPlaceholder"),
                            "aria-label": t("searchAria"),
                            onChange: (e) => setQuery(e.target.value),
                        })
                    ),
                    // 单列 / 双列 切换（图标分段按钮，刷新按钮左侧），中间浅色竖线分隔
                    h("div", { className: "dshpm-seg", role: "group", "aria-label": t("layoutGroup") },
                        h("button", {
                            className: `dshpm-seg-btn${columns === 1 ? " is-active" : ""}`,
                            title: t("col1"),
                            "aria-label": t("col1"),
                            "aria-pressed": columns === 1 ? "true" : "false",
                            onClick: () => changeColumns(1),
                        },
                            h("svg", { viewBox: "0 0 24 24", fill: "currentColor" },
                                h("rect", { x: "9", y: "4", width: "6", height: "16", rx: "1.5" })
                            )
                        ),
                        h("span", { className: "dshpm-seg-divider", "aria-hidden": "true" }),
                        h("button", {
                            className: `dshpm-seg-btn${columns === 2 ? " is-active" : ""}`,
                            title: t("col2"),
                            "aria-label": t("col2"),
                            "aria-pressed": columns === 2 ? "true" : "false",
                            onClick: () => changeColumns(2),
                        },
                            h("svg", { viewBox: "0 0 24 24", fill: "currentColor" },
                                h("rect", { x: "4", y: "4", width: "6.5", height: "16", rx: "1.5" }),
                                h("rect", { x: "13.5", y: "4", width: "6.5", height: "16", rx: "1.5" })
                            )
                        )
                    ),
                    h("button", {
                        className: "dshpm-btn",
                        // 有数据时的 loading 即"刷新中"，按钮禁用并换文案
                        disabled: state.loading && !!state.data,
                        onClick: () => loadData(false),
                    }, state.loading && state.data ? t("refreshing") : t("refresh"))
                    ),
                    state.error && state.data && h("div", {
                        className: "dshpm-banner dshpm-banner-err",
                    }, t("loadError"), state.error),
                    refreshedAt !== null && h("div", {
                        className: "dshpm-banner dshpm-banner-ok",
                        "aria-live": "polite",
                    }, fmt(t("refreshedAt"), refreshedAt.toLocaleTimeString()))
                ),
                plugins.length === 0
                        ? h("div", { className: "dshpm-empty" }, t("empty"))
                        // 有插件但被搜索滤空：提示 + 一键清除
                        : visible.length === 0
                            ? h("div", { className: "dshpm-empty" },
                                h("div", null, t("emptyFiltered")),
                                h("div", { style: { marginTop: "10px" } },
                                    h("button", { className: "dshpm-btn", onClick: clearFilters }, t("clearFilters"))
                                )
                            )
                            : h("ul", { className: "dshpm-list" },
                            visible.map((row) => {
                            const p = pending[row.name];
                            const busy = p === "toggle" || p === "uninstall" || p === "update";
                            // 更新检查结果（npm 源插件才有）；有新版时行内显示徽标
                            const upd = updates[row.name];
                            const canUpdate = !!upd && !!upd.update && !row.protected;
                            // 发布时间（registry ISO 字符串），无效/缺失不显示
                            const publishedText = upd && upd.publishedAt && !isNaN(Date.parse(upd.publishedAt))
                                ? new Date(upd.publishedAt).toLocaleString()
                                : null;
                            // 显示名去掉 npm scope（@user/pkg → pkg）；
                            // scope / github 用户名在「安装来源」字段里看（spec 含完整信息）
                            const displayName = row.name.replace(/^@[^/]+\//, "");
                            // rows 为空说明没有补丁行可控制（纯 client 插件）；
                            // 自身也不可停用——停了就没人能再启用它
                            const canToggle = !row.protected && row.rows.length > 0 && !row.self;
                            const on = !row.disabled;
                            const open = !!expanded[row.name];
                            const switchCls = [
                                "dshpm-switch",
                                on ? "is-on" : "",
                                canToggle ? (busy ? "is-busy" : "") : "is-frozen",
                            ].filter(Boolean).join(" ");
                            const switchTitle = !canToggle
                                ? (row.self
                                    ? t("selfHint")
                                    : row.protected
                                        ? t("protectedToggle")
                                        : t("clientOnlyToggle"))
                                : on ? t("toggleOn") : t("toggleOff");
                            return h("li", {
                                key: row.name,
                                className: `dshpm-card${on ? "" : " is-off"}${open ? " is-open" : ""}`,
                            },
                                // ── 常显行：图标 + 名称 + 状态 + switch + 箭头 ──
                                h("div", {
                                    className: "dshpm-row",
                                    onClick: () => toggleExpand(row.name),
                                },
                                    h("span", { className: "dshpm-icon", "aria-hidden": "true" },
                                        // 统一的插件拼图图标（内联 SVG，随主题色）
                                        h("svg", {
                                            viewBox: "0 0 24 24",
                                            fill: "currentColor",
                                        },
                                            h("path", { d: "M10.5 3a2.5 2.5 0 0 1 2.5 2.5v1h3.5A1.5 1.5 0 0 1 18 8v3.5h1a2.5 2.5 0 0 1 0 5h-1V20a1.5 1.5 0 0 1-1.5 1.5H13v-1a2.5 2.5 0 0 0-5 0v1H4.5A1.5 1.5 0 0 1 3 20v-3.6h1a2.4 2.4 0 0 0 0-4.8H3V8a1.5 1.5 0 0 1 1.5-1.5H8v-1A2.5 2.5 0 0 1 10.5 3Z" })
                                        )
                                    ),
                                    h("span", {
                                        className: "dshpm-name",
                                        // 悬停显示完整名（含 scope）
                                        title: row.name,
                                    }, displayName),
                                    h("div", { className: "dshpm-actions" },
                                        canUpdate ? h("span", {
                                            className: "dshpm-pill is-update",
                                            title: fmt(t("latestVersionTitle"), upd.latest)
                                                + (publishedText ? ` · ${fmt(t("publishedAt"), publishedText)}` : ""),
                                        }, t("updateAvailable")) : null,
                                        h("span", { className: `dshpm-state${row.error ? " is-err" : on ? " is-on" : ""}` },
                                            row.error ? t("stateError") : on ? t("stateOn") : t("stateOff")
                                        ),
                                        h("span", {
                                            role: "switch",
                                            "aria-checked": on ? "true" : "false",
                                            "aria-label": fmt(t("switchAria"), row.name),
                                            className: switchCls,
                                            title: switchTitle,
                                            // 阻止冒泡：点开关不触发展开/收起
                                            onClick: canToggle && !busy
                                                ? (e) => { e.stopPropagation(); toggle(row); }
                                                : (e) => e.stopPropagation(),
                                        },
                                            h("span", { className: "dshpm-knob" })
                                        ),
                                        // 折叠箭头：最右侧，向下 chevron，展开时旋转 180°
                                        h("span", {
                                            className: `dshpm-arrow${open ? " is-open" : ""}`,
                                            "aria-label": open ? t("collapse") : t("expand"),
                                        },
                                            h("svg", {
                                                viewBox: "0 0 24 24",
                                                fill: "none",
                                                stroke: "currentColor",
                                                strokeWidth: 2,
                                                strokeLinecap: "round",
                                                strokeLinejoin: "round",
                                            },
                                                h("path", { d: "M6 9l6 6 6-6" })
                                            )
                                        )
                                    )
                                ),
                                // ── 展开详情：版本 / 来源 / 介绍 / 卸载 ──
                                open ? h("div", { className: "dshpm-detail" },
                                    h("div", { className: "dshpm-field" },
                                        h("span", { className: "dshpm-field-key" }, t("version")),
                                        h("span", { className: "dshpm-field-val" },
                                            row.version === "-" ? row.version : `v${row.version}`
                                        )
                                    ),
                                    // 运行失败信息（fiber FAILED 捕获）：红色、保留换行
                                    row.error ? h("div", { className: "dshpm-field" },
                                        h("span", { className: "dshpm-field-key" }, t("errorField")),
                                        h("span", {
                                            className: "dshpm-field-val",
                                            style: {
                                                color: "var(--dsw-alias-state-error-primary,#d32f2f)",
                                                whiteSpace: "pre-wrap",
                                            },
                                        }, row.error)
                                    ) : null,
                                    canUpdate ? h("div", { className: "dshpm-field" },
                                        h("span", { className: "dshpm-field-key" }, t("latestVersion")),
                                        h("span", { className: "dshpm-field-val is-code", style: { color: "var(--dsw-alias-state-info-primary,#1967d2)" } },
                                            `v${upd.latest}`,
                                            publishedText ? h("span", { className: "dshpm-published" },
                                                ` · ${fmt(t("publishedAt"), publishedText)}`) : null
                                        )
                                    ) : null,
                                    h("div", { className: "dshpm-field" },
                                        h("span", { className: "dshpm-field-key" }, t("source")),
                                        h("span", { className: "dshpm-field-val" },
                                            // 来源分类标签（npm / GitHub / 本地）
                                            h("span", { className: "dshpm-pill" },
                                                row.sourceType === "local"
                                                    ? t("sourceLocal")
                                                    : row.sourceType === "github"
                                                        ? t("sourceGithub")
                                                        : t("sourceNpm")
                                            ),
                                            " ",
                                            // 版本范围 / 路径（悬停看完整 spec）
                                            h("span", {
                                                className: "dshpm-field-val is-code",
                                                style: { display: "inline" },
                                                title: row.spec,
                                            }, row.spec),
                                            // 插件声明的仓库地址（含 github 用户名），可点击
                                            row.repo ? h("span", null,
                                                "  ",
                                                h("a", {
                                                    href: "https://" + row.repo,
                                                    target: "_blank",
                                                    rel: "noreferrer",
                                                    className: "dshpm-repo-link",
                                                    title: row.repo,
                                                }, row.repo)
                                            ) : null
                                        )
                                    ),
                                    h("div", { className: "dshpm-field" },
                                        h("span", { className: "dshpm-field-key" }, t("description")),
                                        h("span", { className: "dshpm-field-val" }, row.description || t("noDescription"))
                                    ),
                                    h("div", { className: "dshpm-detail-actions" },
                                        // 更新按钮：有新版且非宿主模块时显示（自身可更新，确认框有提示）
                                        canUpdate ? h("button", {
                                            className: "dshpm-btn dshpm-btn-update",
                                            disabled: busy,
                                            title: t("updateTitle"),
                                            onClick: () => beginUpdate(row),
                                        }, p === "update" ? t("updating") : t("update")) : null,
                                        !row.protected && !row.self ? h("button", {
                                            className: "dshpm-btn dshpm-btn-danger",
                                            disabled: busy,
                                            title: t("uninstallTitle"),
                                            onClick: () => beginUninstall(row),
                                        }, busy && p === "uninstall" ? t("uninstalling") : t("uninstall")) : h("span", {
                                            className: "dshpm-hint",
                                            title: row.self ? t("selfHint") : t("protectedToggle"),
                                        }, row.self ? t("selfHint") : t("protectedUninstall"))
                                    )
                                ) : null
                            );
                        })
                    ),
                // 确认模态框（dshmarket 同款平台 Modal）：更新 / 卸载 二次确认
                confirming !== null && hasModal ? h(Modal, {
                    open: true,
                    onClose: () => setConfirming(null),
                    title: confirming.kind === "update"
                        ? fmt(t("confirmUpdate"), confirming.row.name,
                            (updates[confirming.row.name] && updates[confirming.row.name].latest) || "")
                        : confirming.row.version !== "-"
                            ? fmt(t("confirmUninstall"), confirming.row.name, confirming.row.version)
                            : fmt(t("confirmUninstallNoVer"), confirming.row.name),
                    description: confirming.kind === "update" ? t("updateTitle") : t("uninstallTitle"),
                    footer: h(React.Fragment, null,
                        h(Button, { variant: "ghost", onClick: () => setConfirming(null) }, t("cancel")),
                        h(Button, {
                            variant: "primary",
                            onClick: () => {
                                const row = confirming.row;
                                const isUpdate = confirming.kind === "update";
                                setConfirming(null);
                                if (isUpdate) update(row);
                                else uninstall(row);
                            },
                        }, confirming.kind === "update" ? t("update") : t("uninstall"))
                    ),
                },
                    // 自身操作的额外提示（弱化色小字）
                    confirming.row.self ? h("p", {
                        style: {
                            fontSize: "12px",
                            color: "var(--dsw-alias-label-tertiary,#888)",
                            marginTop: "4px",
                            marginBottom: "0",
                        },
                    }, confirming.kind === "update" ? t("confirmUpdateSelf") : t("confirmSelf")) : null
                ) : null,
                // Toast 通知容器：固定在视口正中央
                toasts.length > 0 && h("div", { className: "dshpm-toast-container", "aria-live": "polite" },
                    toasts.map((toast) =>
                        h("div", {
                            key: toast.id,
                            className: `dshpm-toast ${toast.type === "error" ? "dshpm-toast-err" : "dshpm-toast-ok"}${toast.leaving ? " is-leaving" : ""}`,
                            role: "alert",
                        },
                            h("span", null, toast.text),
                            // 错误通知显示关闭按钮
                            toast.type === "error" && h("button", {
                                className: "dshpm-toast-close",
                                "aria-label": "关闭",
                                onClick: () => dismissToast(toast.id),
                            },
                                h("svg", {
                                    viewBox: "0 0 24 24",
                                    fill: "none",
                                    stroke: "currentColor",
                                    strokeWidth: 2,
                                    strokeLinecap: "round",
                                    strokeLinejoin: "round",
                                },
                                    h("path", { d: "M18 6L6 18M6 6l12 12" })
                                )
                            )
                        )
                    )
                )
            );
        }

        // client 侧依赖：slots（UI slot 注册）+ locale（多语言词典）
        const inject = ["slots", "locale"];

        /**
         * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
         */
        function apply(ctx) {
            // 注册 zh/en 词典；t 每次调用读取当前激活语言
            ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-plugin-mgr: dictionaries");
            const t = ctx.locale.bind(NS);
            const h = React.createElement;

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

        exports.apply = apply;
        exports.inject = inject;
        return module.exports;
    }
});
