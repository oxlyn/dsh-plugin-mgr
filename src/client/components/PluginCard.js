// 单张插件卡片：常显行（图标 + 名称 + 状态 + switch + 箭头）+ 展开详情
//（版本 / 错误 / 最新版本 / 安装来源 / 介绍 / 更新与卸载按钮）。

import { h } from "../context.js";
import { fmt } from "../i18n.js";

/**
 * @param props {{
 *   t: (key: string) => string,
 *   row: object,                    // PluginRow（宿主 inspect.ts 组装）
 *   upd: { latest: string, update: boolean, publishedAt?: string | null } | undefined,
 *   pending: 'toggle' | 'uninstall' | 'update' | undefined,
 *   open: boolean,
 *   onToggleExpand: () => void,
 *   onToggle: () => void,           // switch 点击（仅 canToggle 时可触发）
 *   onBeginUpdate: () => void,      // 走确认门
 *   onBeginUninstall: () => void,   // 走确认门
 * }}
 */
export function PluginCard(props) {
    const { t, row, upd, pending: p, open, onToggleExpand, onToggle, onBeginUpdate, onBeginUninstall } = props;
    const busy = p === "toggle" || p === "uninstall" || p === "update";
    // 有新版时行内显示徽标（canUpdate 由调用方按 protected 过滤后传入 upd）
    const canUpdate = !!upd && !!upd.update && !row.protected;
    // 发布时间（registry ISO 字符串），无效/缺失不显示
    const publishedText = upd && upd.publishedAt && !isNaN(Date.parse(upd.publishedAt))
        ? new Date(upd.publishedAt).toLocaleString()
        : null;
    // 显示名去掉 npm scope（@user/pkg → pkg）；
    // scope / github 用户名在「安装来源」字段里看（spec 含完整信息）
    const displayName = row.name.replace(/^@[^/]+\//u, "");
    // rows 为空说明没有补丁行可控制（纯 client 插件）；
    // 自身也不可停用——停了就没人能再启用它
    const canToggle = !row.protected && row.rows.length > 0 && !row.self;
    const on = !row.disabled;
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
        className: `dshpm-card${on ? "" : " is-off"}${open ? " is-open" : ""}`,
    },
        // ── 常显行：图标 + 名称 + 状态 + switch + 箭头 ──
        h("div", {
            className: "dshpm-row",
            onClick: onToggleExpand,
        },
            h("span", { className: "dshpm-icon", "aria-hidden": "true" },
                // 统一的插件拼图图标（内联 SVG，随主题色）
                h("svg", { viewBox: "0 0 24 24", fill: "currentColor" },
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
                        ? (e) => { e.stopPropagation(); onToggle(); }
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
        open ? renderDetail() : null
    );

    function renderDetail() {
        return h("div", { className: "dshpm-detail" },
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
                    onClick: onBeginUpdate,
                }, p === "update" ? t("updating") : t("update")) : null,
                !row.protected && !row.self ? h("button", {
                    className: "dshpm-btn dshpm-btn-danger",
                    disabled: busy,
                    title: t("uninstallTitle"),
                    onClick: onBeginUninstall,
                }, busy && p === "uninstall" ? t("uninstalling") : t("uninstall")) : h("span", {
                    className: "dshpm-hint",
                    title: row.self ? t("selfHint") : t("protectedToggle"),
                }, row.self ? t("selfHint") : t("protectedUninstall"))
            )
        );
    }
}
