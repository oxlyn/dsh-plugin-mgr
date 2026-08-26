// 工具栏：profile 统计 + 搜索框 + 单/双列切换 + 刷新按钮。
//
// 搜索框交互（可折叠）：
// - 默认折叠为圆形搜索图标按钮；点击后输入框向左滑出
// - 展开态最左侧是搜索图标，有内容时右侧出现清除按钮
// - 失焦 3s 且无内容时自动折叠回图标；有内容则保持展开

import { getReact } from '../runtime'
import { fmt } from '../i18n'
import type { ReactElement } from 'react'

function MagnifierIcon(): ReactElement {
  const React = getReact()
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

interface CollapsibleSearchProps {
  t: (key: string) => string
  query: string
  onQueryChange: (q: string) => void
}

function CollapsibleSearch({ t, query, onQueryChange }: CollapsibleSearchProps): ReactElement {
  const React = getReact()
  const { useState, useEffect, useRef } = React
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCollapseTimer = () => {
    if (collapseTimerRef.current !== null) {
      clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => clearCollapseTimer, [])

  const expand = () => {
    clearCollapseTimer()
    setOpen(true)
  }

  const handleBlur = () => {
    clearCollapseTimer()
    if (query !== '') return
    collapseTimerRef.current = setTimeout(() => setOpen(false), 3000)
  }

  const clearQuery = () => {
    onQueryChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={`dshpm-search${open ? ' is-open' : ''}`}>
      <div className="dshpm-search-box">
        <button
          type="button"
          className="dshpm-search-icon"
          title={t('searchAria')}
          aria-label={t('searchAria')}
          tabIndex={open ? -1 : 0}
          onClick={() => (open ? inputRef.current?.focus() : expand())}
        >
          <MagnifierIcon />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAria')}
          tabIndex={open ? 0 : -1}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={clearCollapseTimer}
          onBlur={handleBlur}
        />
        {open && query !== '' && (
          <button
            type="button"
            className="dshpm-search-clear"
            title={t('searchClear')}
            aria-label={t('searchClear')}
            onClick={clearQuery}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export interface ToolbarProps {
  t: (key: string) => string
  profile: string
  total: number
  visibleCount: number
  hasFilter: boolean
  query: string
  onQueryChange: (q: string) => void
  columns: 1 | 2
  onColumnsChange: (n: 1 | 2) => void
  refreshing: boolean
  onRefresh: () => void
}

export function Toolbar(props: ToolbarProps): ReactElement {
  const React = getReact()
  const {
    t,
    profile,
    total,
    visibleCount,
    hasFilter,
    query,
    onQueryChange,
    columns,
    onColumnsChange,
    refreshing,
    onRefresh,
  } = props

  return (
    <div className="dshpm-toolbar">
      <span className="dshpm-meta">
        {hasFilter
          ? fmt(t('metaFiltered'), profile, visibleCount, total)
          : fmt(t('meta'), profile, total)}
      </span>
      <CollapsibleSearch t={t} query={query} onQueryChange={onQueryChange} />
      <div className="dshpm-seg" role="group" aria-label={t('layoutGroup')}>
        <button
          className={`dshpm-seg-btn${columns === 1 ? ' is-active' : ''}`}
          title={t('col1')}
          aria-label={t('col1')}
          aria-pressed={columns === 1 ? 'true' : 'false'}
          onClick={() => onColumnsChange(1)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="9" y="4" width="6" height="16" rx="1.5" />
          </svg>
        </button>
        <span className="dshpm-seg-divider" aria-hidden="true" />
        <button
          className={`dshpm-seg-btn${columns === 2 ? ' is-active' : ''}`}
          title={t('col2')}
          aria-label={t('col2')}
          aria-pressed={columns === 2 ? 'true' : 'false'}
          onClick={() => onColumnsChange(2)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="6.5" height="16" rx="1.5" />
            <rect x="13.5" y="4" width="6.5" height="16" rx="1.5" />
          </svg>
        </button>
      </div>
      <button
        className="dshpm-btn"
        disabled={refreshing}
        onClick={onRefresh}
      >
        {refreshing ? t('refreshing') : t('refresh')}
      </button>
    </div>
  )
}
