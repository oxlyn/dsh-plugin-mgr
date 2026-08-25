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

/** Toast 容器渲染（挂在组件树末尾即可）。 */
export function ToastHost({ toasts, onDismiss }) {
    if (toasts.length === 0) return null;
    return h("div", { className: "dshpm-toast-container", "aria-live": "polite" },
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
            )
        )
    );
}
