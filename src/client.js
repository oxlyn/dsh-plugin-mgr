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
            stateOn: "运行中",
            stateOff: "已停止",
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
            stateOn: "Running",
            stateOff: "Stopped",
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
        };

        // ── 样式表（一次性注入；类名 dshpm- 前缀隔离）────────────────────────
        const CSS = `
.dshpm-root { display:flex; flex-direction:column; gap:12px; color:var(--dsw-alias-label-primary,#333); }
.dshpm-toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.dshpm-meta { font-size:13px; color:var(--dsw-alias-label-tertiary,#888); margin-right:auto; }
.dshpm-seg { display:inline-flex; border:1px solid var(--dsw-alias-border-l2,#ddd); border-radius:8px; overflow:hidden; }
.dshpm-seg-btn { border:none; background:transparent; padding:4px 10px; font-size:12px; line-height:18px; cursor:pointer; color:var(--dsw-alias-label-tertiary,#888); transition:color .16s,background .16s; display:inline-flex; align-items:center; justify-content:center; }
.dshpm-seg-btn:hover { color:var(--dsw-alias-label-primary,#333); }
.dshpm-seg-btn.is-active { background:var(--dsw-alias-button-primary-fill,#4f46e5); color:var(--dsw-alias-label-primary-foreground,#fff); }
.dshpm-seg-btn svg { width:14px; height:14px; display:block; }
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
.dshpm-detail-actions { display:flex; justify-content:flex-end; margin-top:8px; }
.dshpm-btn { border-radius:8px; padding:5px 14px; font-size:13px; line-height:1.5; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#ddd); color:var(--dsw-alias-label-secondary,#555); background:transparent; white-space:nowrap; transition:color .16s,border-color .16s,background .16s; }
.dshpm-btn:hover:not(:disabled) { color:var(--dsw-alias-label-primary,#333); border-color:var(--dsw-alias-label-dimmed,#999); }
.dshpm-btn:disabled { opacity:.5; cursor:not-allowed; }
.dshpm-btn-danger { color:var(--dsw-alias-state-error-primary,#d32f2f); border-color:var(--dsw-alias-state-error-primary,#d32f2f); }
.dshpm-btn-danger:hover:not(:disabled) { color:var(--dsw-alias-state-error-primary,#d32f2f); border-color:var(--dsw-alias-state-error-primary,#d32f2f); background:var(--dsw-alias-state-error-bg,#fce8e6); }
.dshpm-banner { font-size:12px; line-height:1.6; padding:8px 12px; border-radius:8px; word-break:break-all; }
.dshpm-banner-ok { background:var(--dsw-alias-state-success-bg,#e6f4ea); color:var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-banner-err { background:var(--dsw-alias-state-error-bg,#fce8e6); color:var(--dsw-alias-state-error-primary,#d32f2f); white-space:pre-wrap; }
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
            const [message, setMessage] = useState(null); // { type: 'ok'|'error', text }
            // 手动刷新反馈：记录刷新完成时间，短暂显示"已刷新"横幅
            const [refreshedAt, setRefreshedAt] = useState(null);
            // 展开状态：{ [name]: boolean }
            const [expanded, setExpanded] = useState({});
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

            useEffect(() => {
                ensureCss();
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
                setMessage(null);
                try {
                    await post("/api/plugin-manager/toggle", { name: row.name, disable });
                    setMessage({
                        type: "ok",
                        text: fmt(disable ? t("disabledMsg") : t("enabledMsg"), row.name),
                    });
                    // HMR 重新组合约需 1s，稍等后刷新状态
                    setTimeout(() => {
                        clearPending(row.name);
                        loadData();
                    }, 1300);
                } catch (e) {
                    setMessage({ type: "error", text: fmt(t("toggleFail"), row.name, e.message) });
                    clearPending(row.name);
                }
            };

            const uninstall = async (row) => {
            const self = row.self ? "\n\n" + t("confirmSelf") : "";
            // 版本未知（'-'，如 link 断链）时确认文案不显示 @-
            const confirmMsg = row.version !== "-"
                ? fmt(t("confirmUninstall"), row.name, row.version)
                : fmt(t("confirmUninstallNoVer"), row.name);
            if (!window.confirm(confirmMsg + self)) return;
                setPending((s) => ({ ...s, [row.name]: "uninstall" }));
                setMessage(null);
                try {
                    await post("/api/plugin-manager/uninstall", { name: row.name, selfConfirm: true });
                    setMessage({ type: "ok", text: fmt(t("uninstalledMsg"), row.name) });
                    setExpanded((s) => ({ ...s, [row.name]: false }));
                    loadData();
                } catch (e) {
                    setMessage({ type: "error", text: fmt(t("uninstallFail"), row.name, e.message) });
                } finally {
                    clearPending(row.name);
                }
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

            return h("div", { className: `dshpm-root${columns === 2 ? " is-cols-2" : ""}` },
                h("div", { className: "dshpm-toolbar" },
                    h("span", { className: "dshpm-meta" },
                        fmt(t("meta"), data.profile, plugins.length)
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
                message && h("div", {
                    className: `dshpm-banner ${message.type === "error" ? "dshpm-banner-err" : "dshpm-banner-ok"}`,
                }, message.text),
                state.error && state.data && h("div", {
                    className: "dshpm-banner dshpm-banner-err",
                }, t("loadError"), state.error),
                refreshedAt !== null && h("div", {
                    className: "dshpm-banner dshpm-banner-ok",
                    "aria-live": "polite",
                }, fmt(t("refreshedAt"), refreshedAt.toLocaleTimeString())),
                plugins.length === 0
                    ? h("div", { className: "dshpm-empty" }, t("empty"))
                    : h("ul", { className: "dshpm-list" },
                        plugins.map((row) => {
                            const p = pending[row.name];
                            const busy = p === "toggle" || p === "uninstall";
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
                                        h("span", { className: `dshpm-state${on ? " is-on" : ""}` },
                                            on ? t("stateOn") : t("stateOff")
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
                                        !row.protected && !row.self ? h("button", {
                                            className: "dshpm-btn dshpm-btn-danger",
                                            disabled: busy,
                                            title: t("uninstallTitle"),
                                            onClick: () => uninstall(row),
                                        }, busy && p === "uninstall" ? t("uninstalling") : t("uninstall")) : h("span", {
                                            className: "dshpm-hint",
                                            title: row.self ? t("selfHint") : t("protectedToggle"),
                                        }, row.self ? t("selfHint") : t("protectedUninstall"))
                                    )
                                ) : null
                            );
                        })
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
