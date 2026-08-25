// 工具栏：profile 统计 + 搜索框 + 单/双列切换 + 刷新按钮。

import { h } from "../context.js";
import { fmt } from "../i18n.js";

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
        // 搜索框：type=search 自带清除按钮
        h("div", { className: "dshpm-search" },
            h("input", {
                type: "search",
                value: query,
                placeholder: t("searchPlaceholder"),
                "aria-label": t("searchAria"),
                onChange: (e) => onQueryChange(e.target.value),
            })
        ),
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
