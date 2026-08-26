// 单张插件卡片：常显行（图标 + 名称 + 状态 + switch + 箭头）+ 展开详情
//（版本 / 错误 / 最新版本 / 安装来源 / 介绍 / 更新与卸载按钮）。

import { getReact } from '../runtime'
import { fmt } from '../i18n'
import type { ReactElement } from 'react'

export interface PluginRow {
  name: string
  version: string
  spec: string
  sourceType: 'local' | 'github' | 'npm'
  repo: string | null
  description: string
  disabled: boolean
  protected: boolean
  rows: string[]
  self: boolean
  error: string | null
}

export interface UpdateInfo {
  latest: string
  update: boolean
  publishedAt?: string | null
}

export interface PendingState {
  [name: string]: 'toggle' | 'uninstall' | 'update' | undefined
}

export interface PluginCardProps {
  t: (key: string) => string
  row: PluginRow
  upd: UpdateInfo | undefined
  pending: 'toggle' | 'uninstall' | 'update' | undefined
  open: boolean
  onToggleExpand: () => void
  onToggle: () => void
  onBeginUpdate: () => void
  onBeginUninstall: () => void
}

export function PluginCard(props: PluginCardProps): ReactElement {
  const { t, row, upd, pending: p, open, onToggleExpand, onToggle, onBeginUpdate, onBeginUninstall } = props
  const React = getReact()

  const busy = p === 'toggle' || p === 'uninstall' || p === 'update'
  const canUpdate = !!upd && !!upd.update && !row.protected
  const publishedText =
    upd && upd.publishedAt && !isNaN(Date.parse(upd.publishedAt))
      ? new Date(upd.publishedAt).toLocaleString()
      : null
  const displayName = row.name.replace(/^@[^/]+\//u, '')
  const canToggle = !row.protected && row.rows.length > 0 && !row.self
  const on = !row.disabled
  const switchCls = [
    'dshpm-switch',
    on ? 'is-on' : '',
    canToggle ? (busy ? 'is-busy' : '') : 'is-frozen',
  ]
    .filter(Boolean)
    .join(' ')
  const switchTitle = !canToggle
    ? row.self
      ? t('selfHint')
      : row.protected
        ? t('protectedToggle')
        : t('clientOnlyToggle')
    : on
      ? t('toggleOn')
      : t('toggleOff')

  return (
    <li className={`dshpm-card${on ? '' : ' is-off'}${open ? ' is-open' : ''}`}>
      <div className="dshpm-row" onClick={onToggleExpand}>
        <span className="dshpm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.5 3a2.5 2.5 0 0 1 2.5 2.5v1h3.5A1.5 1.5 0 0 1 18 8v3.5h1a2.5 2.5 0 0 1 0 5h-1V20a1.5 1.5 0 0 1-1.5 1.5H13v-1a2.5 2.5 0 0 0-5 0v1H4.5A1.5 1.5 0 0 1 3 20v-3.6h1a2.4 2.4 0 0 0 0-4.8H3V8a1.5 1.5 0 0 1 1.5-1.5H8v-1A2.5 2.5 0 0 1 10.5 3Z" />
          </svg>
        </span>
        <span className="dshpm-name" title={row.name}>
          {displayName}
        </span>
        <div className="dshpm-actions">
          {canUpdate && (
            <span
              className="dshpm-pill is-update"
              title={
                fmt(t('latestVersionTitle'), upd.latest) +
                (publishedText ? ` · ${fmt(t('publishedAt'), publishedText)}` : '')
              }
            >
              {t('updateAvailable')}
            </span>
          )}
          <span
            className={`dshpm-state${row.error ? ' is-err' : ''}${on && !row.error ? ' is-on' : ''}`}
          >
            {row.error ? t('stateError') : on ? t('stateOn') : t('stateOff')}
          </span>
          <span
            role="switch"
            aria-checked={on ? 'true' : 'false'}
            aria-label={fmt(t('switchAria'), row.name)}
            className={switchCls}
            title={switchTitle}
            onClick={(e) => {
              e.stopPropagation()
              if (canToggle && !busy) onToggle()
            }}
          >
            <span className="dshpm-knob" />
          </span>
          <span
            className={`dshpm-arrow${open ? ' is-open' : ''}`}
            aria-label={open ? t('collapse') : t('expand')}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </div>
      </div>
      {open ? (
        <div className="dshpm-detail">
          <div className="dshpm-field">
            <span className="dshpm-field-key">{t('version')}</span>
            <span className="dshpm-field-val">
              {row.version === '-' ? row.version : `v${row.version}`}
            </span>
          </div>
          {row.error ? (
            <div className="dshpm-field">
              <span className="dshpm-field-key">{t('errorField')}</span>
              <span
                className="dshpm-field-val"
                style={{
                  color: 'var(--dsw-alias-state-error-primary,#d32f2f)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {row.error}
              </span>
            </div>
          ) : null}
          {canUpdate && (
            <div className="dshpm-field">
              <span className="dshpm-field-key">{t('latestVersion')}</span>
              <span
                className="dshpm-field-val is-code"
                style={{ color: 'var(--dsw-alias-state-info-primary,#1967d2)' }}
              >
                {`v${upd.latest}`}
                {publishedText && (
                  <span className="dshpm-published">
                    {' · '}{fmt(t('publishedAt'), publishedText)}
                  </span>
                )}
              </span>
            </div>
          )}
          <div className="dshpm-field">
            <span className="dshpm-field-key">{t('source')}</span>
            <span className="dshpm-field-val">
              <span className="dshpm-pill">
                {row.sourceType === 'local'
                  ? t('sourceLocal')
                  : row.sourceType === 'github'
                    ? t('sourceGithub')
                    : t('sourceNpm')}
              </span>{' '}
              <span className="dshpm-field-val is-code" style={{ display: 'inline' }} title={row.spec}>
                {row.spec}
              </span>
              {row.repo && (
                <span>
                  {'  '}
                  <a
                    href={'https://' + row.repo}
                    target="_blank"
                    rel="noreferrer"
                    className="dshpm-repo-link"
                    title={row.repo}
                  >
                    {row.repo}
                  </a>
                </span>
              )}
            </span>
          </div>
          <div className="dshpm-field">
            <span className="dshpm-field-key">{t('description')}</span>
            <span className="dshpm-field-val">{row.description || t('noDescription')}</span>
          </div>
          <div className="dshpm-detail-actions">
            {canUpdate ? (
              <button
                className="dshpm-btn dshpm-btn-update"
                disabled={busy}
                title={t('updateTitle')}
                onClick={onBeginUpdate}
              >
                {p === 'update' ? t('updating') : t('update')}
              </button>
            ) : null}
            {row.protected || row.self ? (
              <span className="dshpm-hint" title={row.self ? t('selfHint') : t('protectedToggle')}>
                {row.self ? t('selfHint') : t('protectedUninstall')}
              </span>
            ) : (
              <button
                className="dshpm-btn dshpm-btn-danger"
                disabled={busy}
                title={t('uninstallTitle')}
                onClick={onBeginUninstall}
              >
                {busy && p === 'uninstall' ? t('uninstalling') : t('uninstall')}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  )
}
