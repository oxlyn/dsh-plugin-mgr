// 确认模态框：更新 / 卸载 二次确认（dshmarket 同款平台 Modal）。
// 无平台原语时调用方应回退原生 window.confirm，不渲染本组件。

import { h, hooks, uiPrimitives } from "../context.js";
import { fmt } from "../i18n.js";

/**
 * @param props {{
 *   confirming: null | { kind: 'update' | 'uninstall', row: object },
 *   updates: Record<string, { latest: string }>,
 *   t: (key: string) => string,
 *   onClose: () => void,
 *   onConfirm: (kind: 'update' | 'uninstall', row: object) => void,
 * }}
 */
export function ConfirmModal(props) {
    const { confirming, updates, t, onClose, onConfirm } = props;
    const { Fragment } = hooks();
    const { Modal, Button } = uiPrimitives();
    const hasModal = Modal !== null && Button !== null;

    if (confirming === null || !hasModal) return null;

    return h(Modal, {
        open: true,
        onClose,
        title: confirming.kind === "update"
            ? fmt(t("confirmUpdate"), confirming.row.name,
                (updates[confirming.row.name] && updates[confirming.row.name].latest) || "")
            : confirming.row.version !== "-"
                ? fmt(t("confirmUninstall"), confirming.row.name, confirming.row.version)
                : fmt(t("confirmUninstallNoVer"), confirming.row.name),
        description: confirming.kind === "update" ? t("updateTitle") : t("uninstallTitle"),
        footer: h(Fragment, null,
            h(Button, { variant: "ghost", onClick: onClose }, t("cancel")),
            h(Button, {
                variant: "primary",
                onClick: () => {
                    const { kind, row } = confirming;
                    onClose();
                    onConfirm(kind, row);
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
    );
}
