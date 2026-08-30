// 「插件管理」tab 主组件：状态编排 + 布局。
// UI 子块拆在同目录 components/，Toast 在 toast.tsx。

import { getReact } from './runtime'
import { fmt } from './i18n'
import { ensureCss } from './styles'
import { get, post, API } from './api'
import { useToasts, ToastHost } from './toast'
import { Toolbar } from './components/Toolbar'
import { PluginCard } from './components/PluginCard'
import { ConfirmModal } from './components/ConfirmModal'
import type { LocaleService } from './types'
import type { PluginRow, UpdateInfo } from '../shared/types'
import type { ReactElement } from 'react'

export interface ListData {
  ok: boolean
  error?: string
  profile: string
  plugins: PluginRow[]
}

export interface UpdatesMap {
  [name: string]: UpdateInfo | undefined
}

export interface PluginManagerTabProps {
  t: (key: string) => string
  locale: LocaleService
}

/**
 * 「插件管理」tab 组件。
 * 手风琴卡片：行内常显 名称 + 状态文本 + switch；点箭头（或行）展开详情。
 */
export function PluginManagerTab({ t, locale }: PluginManagerTabProps): ReactElement {
  const React = getReact()
  const { useState, useEffect, useCallback, useRef } = React
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    data: ListData | null
  }>({ loading: true, error: null, data: null })
  const [pending, setPending] = useState<{
    [name: string]: 'toggle' | 'uninstall' | 'update'
  }>({})
  const { toasts, addToast, dismissToast } = useToasts()
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<{ [name: string]: boolean }>({})
  const [confirming, setConfirming] = useState<{
    kind: 'update' | 'uninstall'
    row: {
      name: string
      version: string
      self: boolean
      protected: boolean
    }
  } | null>(null)
  const COLUMNS_KEY = 'dsh-plugin-mgr:columns'
  const [columns, setColumns] = useState<1 | 2>(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_KEY)
      return raw === '2' ? 2 : 1
    } catch {
      return 1
    }
  })
  const [, setLocaleTick] = useState(0)
  const [updates, setUpdates] = useState<UpdatesMap>({})
  const [query, setQuery] = useState('')

  const rootRef = useRef<HTMLDivElement | null>(null)
  const hasList = !!state.data && !state.error

  useEffect(() => {
    ensureCss()
    const el = rootRef.current
    if (!el) return

    const findScrollParent = (node: Element): Element | null => {
      let p = node.parentElement
      while (p && p !== document.body) {
        const oy = getComputedStyle(p).overflowY
        if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return p
        p = p.parentElement
      }
      return null
    }

    const fit = () => {
      const top = el.getBoundingClientRect().top
      const sp = findScrollParent(el)
      let avail: number
      if (sp) {
        const sr = sp.getBoundingClientRect()
        const pb = parseFloat(getComputedStyle(sp).paddingBottom) || 0
        avail = sr.bottom - pb - top - 4
      } else {
        avail = window.innerHeight - top - 24
      }
      el.style.maxHeight = `${Math.max(avail, 240)}px`
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(document.body)
    ro.observe(el)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [hasList])

  useEffect(() => {
    if (!locale || typeof locale.subscribe !== 'function') return
    return locale.subscribe(() => setLocaleTick((n) => n + 1))
  }, [locale])

  const changeColumns = (n: 1 | 2) => {
    setColumns(n)
    try {
      localStorage.setItem(COLUMNS_KEY, String(n))
    } catch { /* ignore */ }
  }

  const loadData = useCallback(async (silent?: boolean) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const json = await get<ListData>(API.list)
      if (!json.ok) throw new Error(json.error || 'unknown error')
      setState({ loading: false, error: null, data: json })
      if (!silent) setRefreshedAt(new Date())
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }))
    }
  }, [])

  useEffect(() => {
    loadData(true)
  }, [loadData])

  useEffect(() => {
    if (refreshedAt === null) return
    const timer = setTimeout(() => setRefreshedAt(null), 1500)
    return () => clearTimeout(timer)
  }, [refreshedAt])

  const fetchUpdates = useCallback(async () => {
    try {
      const json = await get<{ ok: boolean; updates?: UpdatesMap }>(API.updates)
      if (!json.ok) return
      setUpdates(json.updates || {})
    } catch { /* 静默：检查失败只是不显示徽标 */ }
  }, [])

  useEffect(() => {
    if (state.data) fetchUpdates()
  }, [state.data, fetchUpdates])

  const clearPending = (name: string) =>
    setPending((s) => {
      const next = { ...s }
      delete next[name]
      return next
    })

  const toggleExpand = (name: string) => {
    setExpanded((s) => ({ ...s, [name]: !s[name] }))
  }

  const toggle = async (row: ListData['plugins'][0]) => {
    const disable = !row.disabled
    setPending((s) => ({ ...s, [row.name]: 'toggle' }))
    try {
      await post(API.toggle, { name: row.name, disable })
      addToast('ok', fmt(disable ? t('disabledMsg') : t('enabledMsg'), row.name))
      setTimeout(() => {
        clearPending(row.name)
        loadData()
      }, 1300)
    } catch (e) {
      addToast('error', fmt(t('toggleFail'), row.name, (e as Error).message))
      clearPending(row.name)
    }
  }

  const uninstall = async (row: ListData['plugins'][0]) => {
    setPending((s) => ({ ...s, [row.name]: 'uninstall' }))
    try {
      await post(API.uninstall, { name: row.name, selfConfirm: true })
      addToast('ok', fmt(t('uninstalledMsg'), row.name))
      setExpanded((s) => ({ ...s, [row.name]: false }))
      loadData()
    } catch (e) {
      addToast('error', fmt(t('uninstallFail'), row.name, (e as Error).message))
    } finally {
      clearPending(row.name)
    }
  }

  const update = async (row: ListData['plugins'][0]) => {
    const info = updates[row.name]
    const latest = (info && info.latest) || ''
    setPending((s) => ({ ...s, [row.name]: 'update' }))
    try {
      const json = await post<{ ok: boolean; updated?: boolean; version?: string }>(API.update, {
        name: row.name,
        selfConfirm: true,
      })
      if (json.updated === false) {
        addToast('error', fmt(t('updateSkipped'), row.name, json.version || row.version))
      } else {
        addToast('ok', fmt(t('updatedMsg'), row.name, json.version || latest))
      }
      await loadData(true)
      fetchUpdates()
    } catch (e) {
      addToast('error', fmt(t('updateFail'), row.name, (e as Error).message))
    } finally {
      clearPending(row.name)
    }
  }

  // 确认门：无平台 Modal 时调用方走原生 window.confirm（不渲染本组件）
  const beginUninstall = (row: ListData['plugins'][0]) => {
    setConfirming({ kind: 'uninstall', row: { name: row.name, version: row.version, self: row.self, protected: row.protected } })
  }

  const beginUpdate = (row: ListData['plugins'][0]) => {
    setConfirming({ kind: 'update', row: { name: row.name, version: row.version, self: row.self, protected: row.protected } })
  }

  const onConfirmAction = (kind: 'update' | 'uninstall', row: { name: string }) => {
    const target = state.data?.plugins.find((p) => p.name === row.name)
    if (!target) return
    if (kind === 'update') update(target)
    else uninstall(target)
  }

  if (state.loading && !state.data) {
    return <div className="dshpm-root"><div className="dshpm-loading">{t('loading')}</div></div>
  }
  if (state.error && !state.data) {
    return (
      <div className="dshpm-root">
        <div className="dshpm-banner dshpm-banner-err">{t('loadError')} {state.error}</div>
        <div>
          <button className="dshpm-btn" onClick={() => loadData(false)}>
            {t('retry')}
          </button>
        </div>
      </div>
    )
  }

  const data = state.data || { profile: '', plugins: [] }
  const plugins = data.plugins || []

  const q = query.trim().toLowerCase()
  const hasFilter = q !== ''
  const visible = plugins.filter((row) => {
    if (q !== '' && !`${row.name}\n${row.description}\n${row.spec}`.toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div ref={rootRef} className={`dshpm-root${columns === 2 ? ' is-cols-2' : ''}`}>
      <Toolbar
        t={t}
        profile={data.profile}
        total={plugins.length}
        visibleCount={visible.length}
        hasFilter={hasFilter}
        query={query}
        onQueryChange={setQuery}
        columns={columns}
        onColumnsChange={changeColumns}
        refreshing={state.loading && !!state.data}
        onRefresh={() => loadData(false)}
      />
      {state.error && state.data && (
        <div className="dshpm-banner dshpm-banner-err">
          {t('loadError')} {state.error}
        </div>
      )}
      {refreshedAt !== null && (
        <div className="dshpm-banner dshpm-banner-ok" aria-live="polite">
          {fmt(t('refreshedAt'), refreshedAt.toLocaleTimeString())}
        </div>
      )}
      <div className="dshpm-list-area">
        {plugins.length === 0 ? (
          <div className="dshpm-empty">{t('empty')}</div>
        ) : visible.length === 0 ? (
          <div className="dshpm-empty">
            <div>{t('emptyFiltered')}</div>
            <div style={{ marginTop: '10px' }}>
              <button className="dshpm-btn" onClick={() => setQuery('')}>
                {t('clearFilters')}
              </button>
            </div>
          </div>
        ) : (
          <ul className="dshpm-list">
            {visible.map((row) => (
              <PluginCard
                key={row.name}
                t={t}
                row={row}
                upd={updates[row.name]}
                pending={pending[row.name]}
                open={!!expanded[row.name]}
                onToggleExpand={() => toggleExpand(row.name)}
                onToggle={() => toggle(row)}
                onBeginUpdate={() => beginUpdate(row)}
                onBeginUninstall={() => beginUninstall(row)}
              />
            ))}
          </ul>
        )}
      </div>
      <ConfirmModal
        confirming={confirming}
        updates={updates}
        t={t}
        onClose={() => setConfirming(null)}
        onConfirm={onConfirmAction}
      />
      <ToastHost toasts={toasts} onDismiss={dismissToast} t={t} />
    </div>
  )
}
