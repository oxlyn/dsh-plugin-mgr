// Toast 通知：成功自动消失（3.5s 退出动画 → 4s 移除），失败常驻由用户关闭。
// 容器固定在视口正中央，不随页面滚动（见 styles.ts 的 .dshpm-toast-container）。

import { getReact } from './runtime'
import type { ReactElement } from 'react'

export interface ToastItem {
  id: number
  type: 'ok' | 'error'
  text: string
  leaving: boolean
}

export interface ToastState {
  toasts: ToastItem[]
  addToast: (type: 'ok' | 'error', text: string) => void
  dismissToast: (id: number) => void
}

/** Toast 队列状态与操作。 */
export function useToasts(): ToastState {
  const React = getReact()
  const { useState, useCallback, useRef } = React
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const addToast = useCallback((type: 'ok' | 'error', text: string) => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, type, text, leaving: false }])
    if (type === 'ok') {
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      }, 3500)
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    }
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 300)
  }, [])

  return { toasts, addToast, dismissToast }
}

export interface ToastHostProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
  t?: (key: string) => string
}

/**
 * Toast 容器渲染（挂在组件树末尾即可）。
 * 错误通知文本超长时默认缩略（6 行），点击切换展开/收起——
 * 否则超长信息会把居中定位的容器撑出视口，关闭按钮点不到。
 */
export function ToastHost({ toasts, onDismiss, t }: ToastHostProps): ReactElement | null {
  const React = getReact()
  const { useState } = React
  const [expandedIds, setExpandedIds] = useState(() => new Set<number>())
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (toasts.length === 0) return null
  return (
    <div className="dshpm-toast-container" aria-live="polite">
      {toasts.map((toast) => {
        const isError = toast.type === 'error'
        const expanded = expandedIds.has(toast.id)
        const clamped = isError && !expanded
        return (
          <div
            key={toast.id}
            className={`dshpm-toast ${isError ? 'dshpm-toast-err' : 'dshpm-toast-ok'}${toast.leaving ? ' is-leaving' : ''}`}
            role="alert"
          >
            <span
              className={`dshpm-toast-text${clamped ? ' is-clamped' : ''}`}
              onClick={isError ? () => toggleExpand(toast.id) : undefined}
              title={isError ? (clamped ? t?.('toastExpand') : t?.('toastCollapse')) : undefined}
            >
              {toast.text}
            </span>
            {isError && (
              <button
                className="dshpm-toast-close"
                aria-label={t?.('toastClose') ?? '关闭'}
                title={t?.('toastClose') ?? '关闭'}
                onClick={() => onDismiss(toast.id)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
