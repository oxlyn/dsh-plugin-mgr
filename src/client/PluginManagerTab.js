// 「插件管理」tab 主组件：状态编排 + 布局。
// UI 子块拆在同目录 components/，Toast 在 toast.js。

import { h, hooks, uiPrimitives } from "./context.js";
import { fmt } from "./i18n.js";
import { ensureCss } from "./styles.js";
import { get, post, API } from "./api.js";
import { useToasts, ToastHost } from "./toast.js";
import { Toolbar } from "./components/Toolbar.js";
import { PluginCard } from "./components/PluginCard.js";
import { ConfirmModal } from "./components/ConfirmModal.js";

/**
 * 「插件管理」tab 组件。
 * 手风琴卡片：行内常显 名称 + 状态文本 + switch；点箭头（或行）展开详情。
 * props: { t, locale } — t 为绑定了词典命名空间的翻译函数，
 * locale 用于订阅语言变化触发重渲染。
 */
export function PluginManagerTab({ t, locale }) {
    // hooks 必须在组件体内取用（模块求值时平台 require 尚未绑定）
    const { useState, useEffect, useCallback, useRef } = hooks();
    const [state, setState] = useState({ loading: true, error: null, data: null });    // 单行操作进行中：{ [name]: 'toggle' | 'uninstall' }
    const [pending, setPending] = useState({});
    const { toasts, addToast, dismissToast } = useToasts();
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
    const [, setLocaleTick] = useState(0);
    // 更新检查结果：{ [name]: { latest, update } }（列表加载后异步补充）
    const [updates, setUpdates] = useState({});
    // 搜索（内存态：匹配 名称/描述/spec，不区分大小写）
    const [query, setQuery] = useState("");

    // 根容器引用：用于按宿主滚动容器计算可用高度
    const rootRef = useRef(null);
    // 列表数据是否已就绪：首屏是 loading 分支（无 ref 元素），
    // 数据到位后才出现带 ref 的根容器，effect 需随之重跑
    const hasList = !!state.data && !state.error;

    useEffect(() => {
        ensureCss();
        // 高度自适应：根容器限高到「宿主滚动容器的内容区底部」，
        // 让外层面板不产生第二条滚动条（全程只有列表区自己的滚动条）。
        // tab 标题 / 工具栏天然固定；不用 sticky、不用自定义背景色。
        const el = rootRef.current;
        if (!el) return;
        // 向上找最近的滚动容器（overflow-y 为 auto/scroll 的祖先）
        const findScrollParent = (node) => {
            let p = node.parentElement;
            while (p && p !== document.body) {
                const oy = getComputedStyle(p).overflowY;
                if (oy === "auto" || oy === "scroll" || oy === "overlay") return p;
                p = p.parentElement;
            }
            return null;
        };
        const fit = () => {
            const top = el.getBoundingClientRect().top;
            const sp = findScrollParent(el);
            let avail;
            if (sp) {
                // 贴住滚动容器内容区底部：容器底边 - 其 padding-bottom - 组件顶边
                const sr = sp.getBoundingClientRect();
                const pb = parseFloat(getComputedStyle(sp).paddingBottom) || 0;
                avail = sr.bottom - pb - top - 4; // 4px 呼吸余量
            } else {
                // 找不到滚动容器时回退为视口估算
                avail = window.innerHeight - top - 24;
            }
            el.style.maxHeight = `${Math.max(avail, 240)}px`;
        };
        fit();
        // 视口尺寸 / 宿主布局变化（侧栏折叠、横幅出现等）时重算；
        // 同时观察根元素自身（工具栏换行等会改变其内部布局）
        const ro = new ResizeObserver(fit);
        ro.observe(document.body);
        ro.observe(el);
        window.addEventListener("resize", fit);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", fit);
        };
    }, [hasList]);

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
            const json = await get(API.list);
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
            const json = await get(API.updates);
            if (!json.ok) return;
            setUpdates(json.updates || {});
        } catch { /* 静默：检查失败只是不显示徽标 */ }
    }, []);

    useEffect(() => {
        if (state.data) fetchUpdates();
    }, [state.data, fetchUpdates]);

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
            await post(API.toggle, { name: row.name, disable });
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
            await post(API.uninstall, { name: row.name, selfConfirm: true });
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
            const json = await post(API.update, { name: row.name, selfConfirm: true });
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
    const hasModal = (() => {
        const { Modal, Button } = uiPrimitives();
        return Modal !== null && Button !== null;
    })();

    const beginUninstall = (row) => {
        if (!hasModal) {
            const self = row.self ? "\n\n" + t("confirmSelf") : "";
            // 版本未知（'-'，如 link 断链）时确认文案不显示 @-
            const text = (row.version !== "-"
                ? fmt(t("confirmUninstall"), row.name, row.version)
                : fmt(t("confirmUninstallNoVer"), row.name)) + self;
            if (!window.confirm(text)) return;
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

    const onConfirmAction = (kind, row) => {
        if (kind === "update") update(row);
        else uninstall(row);
    };

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

    return h("div", { ref: rootRef, className: `dshpm-root${columns === 2 ? " is-cols-2" : ""}` },
        h(Toolbar, {
            t,
            profile: data.profile,
            total: plugins.length,
            visibleCount: visible.length,
            hasFilter,
            query,
            onQueryChange: setQuery,
            columns,
            onColumnsChange: changeColumns,
            refreshing: state.loading && !!state.data,
            onRefresh: () => loadData(false),
        }),
        state.error && state.data && h("div", {
            className: "dshpm-banner dshpm-banner-err",
        }, t("loadError"), state.error),
        refreshedAt !== null && h("div", {
            className: "dshpm-banner dshpm-banner-ok",
            "aria-live": "polite",
        }, fmt(t("refreshedAt"), refreshedAt.toLocaleTimeString())),
        h("div", { className: "dshpm-list-area" },
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
                        visible.map((row) =>
                            h(PluginCard, {
                                key: row.name,
                                t,
                                row,
                                upd: updates[row.name],
                                pending: pending[row.name],
                                open: !!expanded[row.name],
                                onToggleExpand: () => toggleExpand(row.name),
                                onToggle: () => toggle(row),
                                onBeginUpdate: () => beginUpdate(row),
                                onBeginUninstall: () => beginUninstall(row),
                            })
                        )
                    )
        ),
        // 确认模态框（dshmarket 同款平台 Modal）：更新 / 卸载 二次确认
        h(ConfirmModal, {
            confirming,
            updates,
            t,
            onClose: () => setConfirming(null),
            onConfirm: onConfirmAction,
        }),
        // Toast 通知容器：固定在视口正中央
        h(ToastHost, { toasts, onDismiss: dismissToast })
    );
}
