// Toast 通知：成功自动消失（3.5s 退出动画 → 4s 移除），失败常驻由用户关闭。
// 容器固定在视口正中央，不随页面滚动（见 styles.js 的 .dshpm-toast-container）。

import { h, hooks } from "./context.js";

/** Toast 队列状态与操作。 */
export function useToasts() {
    const { useState, useCallback, useRef } = hooks();
    // { id, type: 'ok'|'error', text, leaving }
    const [toasts, setToasts] = useState([]);
    const idRef = useRef(0);

    // 成功通知自动消失；失败通知不自动消失
    const addToast = useCallback((type, text) => {
        const id = ++idRef.current;
        setToasts((prev) => [...prev, { id, type, text, leaving: false }]);
        if (type === "ok") {
            setTimeout(() => {
                setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
            }, 3500);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 4000);
        }
    }, []);

    // 手动关闭：先播退出动画再移除
    const dismissToast = useCallback((id) => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 300);
    }, []);

    return { toasts, addToast, dismissToast };
}

/**
 * Toast 容器渲染（挂在组件树末尾即可）。
 * 错误通知文本超长时默认缩略（6 行），点击切换展开/收起——
 * 否则超长信息会把居中定位的容器撑出视口，关闭按钮点不到。
 */
export function ToastHost({ toasts, onDismiss, t }) {
    const { useState } = hooks();
    // 展开全文的 toast id 集合（仅错误通知可切换）
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    const toggleExpand = (id) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (toasts.length === 0) return null;
    return h("div", { className: "dshpm-toast-container", "aria-live": "polite" },
        toasts.map((toast) => {
            const isError = toast.type === "error";
            const expanded = expandedIds.has(toast.id);
            const clamped = isError && !expanded;
            return h("div", {
                key: toast.id,
                className: `dshpm-toast ${isError ? "dshpm-toast-err" : "dshpm-toast-ok"}${toast.leaving ? " is-leaving" : ""}`,
                role: "alert",
            },
                h("span", {
                    className: `dshpm-toast-text${clamped ? " is-clamped" : ""}`,
                    // 错误且已缩略时可点击展开；title 提示当前操作
                    onClick: isError ? () => toggleExpand(toast.id) : undefined,
                    title: isError ? (clamped ? t?.("toastExpand") : t?.("toastCollapse")) : undefined,
                }, toast.text),
                // 错误通知显示关闭按钮
                isError && h("button", {
                    className: "dshpm-toast-close",
                    "aria-label": t?.("toastClose") ?? "关闭",
                    title: t?.("toastClose") ?? "关闭",
                    onClick: () => onDismiss(toast.id),
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
            );
        })
    );
}
