// 工具栏：profile 统计 + 搜索框 + 单/双列切换 + 刷新按钮。
//
// 搜索框交互（可折叠）：
// - 默认折叠为圆形搜索图标按钮；点击后输入框向左滑出
// - 展开态最左侧是搜索图标，有内容时右侧出现清除按钮
// - 失焦 3s 且无内容时自动折叠回图标；有内容则保持展开

import { h, hooks } from "../context.js";
import { fmt } from "../i18n.js";

/** 放大镜图标（stroke 风格，随主题色）。 */
function MagnifierIcon() {
    return h("svg", {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
    },
        h("circle", { cx: "11", cy: "11", r: "7" }),
        h("path", { d: "M21 21l-4.35-4.35" })
    );
}

/**
 * 可折叠搜索框。
 * @param props {{
 *   t: (key: string) => string,
 *   query: string, onQueryChange: (q: string) => void,
 * }}
 */
function CollapsibleSearch({ t, query, onQueryChange }) {
    const { useState, useEffect, useRef } = hooks();
    const [open, setOpen] = useState(false);
    const inputRef = useRef(null);
    const collapseTimerRef = useRef(null);

    const clearCollapseTimer = () => {
        if (collapseTimerRef.current !== null) {
            clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
        }
    };

    // 展开后聚焦输入框
    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    // 卸载时清理待折叠定时器
    useEffect(() => clearCollapseTimer, []);

    const expand = () => {
        clearCollapseTimer();
        setOpen(true);
    };

    // 失焦：3s 后折叠——仅当没有搜索内容；有内容保持展开
    const handleBlur = () => {
        clearCollapseTimer();
        if (query !== "") return;
        collapseTimerRef.current = setTimeout(() => setOpen(false), 3000);
    };

    // 清除内容并继续输入（不触发折叠判定）
    const clearQuery = () => {
        onQueryChange("");
        inputRef.current?.focus();
    };

    return h("div", { className: `dshpm-search${open ? " is-open" : ""}` },
        h("div", { className: "dshpm-search-box" },
            // 搜索图标：折叠态是展开入口；展开态点击=聚焦输入框
            h("button", {
                type: "button",
                className: "dshpm-search-icon",
                title: t("searchAria"),
                "aria-label": t("searchAria"),
                tabIndex: open ? -1 : 0,
                onClick: () => (open ? inputRef.current?.focus() : expand()),
            }, h(MagnifierIcon)),
            h("input", {
                ref: inputRef,
                type: "text",
                value: query,
                placeholder: t("searchPlaceholder"),
                "aria-label": t("searchAria"),
                // 折叠态不可达（由图标按钮承担键盘入口）
                tabIndex: open ? 0 : -1,
                onChange: (e) => onQueryChange(e.target.value),
                onFocus: clearCollapseTimer,
                onBlur: handleBlur,
            }),
            // 清除按钮：仅在展开且有内容时出现
            open && query !== "" && h("button", {
                type: "button",
                className: "dshpm-search-clear",
                title: t("searchClear"),
                "aria-label": t("searchClear"),
                onClick: clearQuery,
            },
                h("svg", {
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: 2,
                    strokeLinecap: "round",
                    "aria-hidden": "true",
                },
                    h("path", { d: "M18 6L6 18M6 6l12 12" })
                )
            )
        )
    );
}

/**
 * @param props {{
 *   t: (key: string) => string,
 *   profile: string,
 *   total: number, visibleCount: number, hasFilter: boolean,
 *   query: string, onQueryChange: (q: string) => void,
 *   columns: 1 | 2, onColumnsChange: (n: 1 | 2) => void,
 *   refreshing: boolean, onRefresh: () => void,
 * }}
 */
export function Toolbar(props) {
    const { t, profile, total, visibleCount, hasFilter, query, onQueryChange, columns, onColumnsChange, refreshing, onRefresh } = props;
    return h("div", { className: "dshpm-toolbar" },
        h("span", { className: "dshpm-meta" },
            hasFilter
                ? fmt(t("metaFiltered"), profile, visibleCount, total)
                : fmt(t("meta"), profile, total)
        ),
        h(CollapsibleSearch, { t, query, onQueryChange }),
        // 单列 / 双列 切换（图标分段按钮，刷新按钮左侧），中间浅色竖线分隔
        h("div", { className: "dshpm-seg", role: "group", "aria-label": t("layoutGroup") },
            h("button", {
                className: `dshpm-seg-btn${columns === 1 ? " is-active" : ""}`,
                title: t("col1"),
                "aria-label": t("col1"),
                "aria-pressed": columns === 1 ? "true" : "false",
                onClick: () => onColumnsChange(1),
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
                onClick: () => onColumnsChange(2),
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
            disabled: refreshing,
            onClick: onRefresh,
        }, refreshing ? t("refreshing") : t("refresh"))
    );
}
