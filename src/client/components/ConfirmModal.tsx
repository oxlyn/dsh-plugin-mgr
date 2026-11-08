// 确认模态框：更新 / 卸载 二次确认（dshmarket 同款平台 Modal）。
// 无平台原语时调用方应回退原生 window.confirm，不渲染本组件。

import { getReact, getRequire, isRenderableComponent } from '../runtime'
import { fmt } from '../i18n'
import type { UpdateInfo } from '../../shared/types'
import type { ReactElement } from 'react'

export interface ConfirmRow {
  name: string
  version: string
  self: boolean
  protected: boolean
}

export interface ConfirmState {
  kind: 'update' | 'uninstall'
  row: ConfirmRow
}

export interface UpdatesMap {
  [name: string]: UpdateInfo | undefined
}

export interface ConfirmModalProps {
  confirming: ConfirmState | null
  updates: UpdatesMap
  t: (key: string) => string
  onClose: () => void
  onConfirm: (kind: 'update' | 'uninstall', row: ConfirmRow) => void
}

/**
 * 运行时探测平台 Modal / Button（dshmarket 同款）。不可用（模块缺席、
 * 导出 undefined、非组件的坏 shim）返回 null，调用方走 window.confirm 回退。
 * 探测接受函数与 $$typeof 包装对象——宿主 0.2.0 起 Button 是 forwardRef，
 * 只认 `typeof === 'function'` 会让确认框永远不渲染（点更新/卸载无反应）。
 */
export function platformModal(): { Modal: unknown; Button: unknown } | null {
  try {
    const p = getRequire()('@deepseek-ai/dsh-client-ui-primitives')
    const { Modal, Button } = (p ?? {}) as { Modal?: unknown; Button?: unknown }
    if (!isRenderableComponent(Modal) || !isRenderableComponent(Button)) return null
    return { Modal, Button }
  } catch {
    return null
  }
}

/** 平台确认框是否可用（PluginManagerTab 用它决定是否走原生 confirm 回退）。 */
export function platformModalAvailable(): boolean {
  return platformModal() !== null
}

export function ConfirmModal(props: ConfirmModalProps): ReactElement | null {
  const { confirming, updates, t, onClose, onConfirm } = props
  const React = getReact()
  const { Fragment } = React

  const platform = platformModal()
  const hasModal = platform !== null

  if (confirming === null || !hasModal) return null
  const { Modal, Button } = platform as { Modal: unknown; Button: unknown }

  const isUpdate = confirming.kind === 'update'
  const latest = (updates[confirming.row.name] && updates[confirming.row.name]?.latest) || ''
  const title = isUpdate
    ? fmt(t('confirmUpdate'), confirming.row.name, latest)
    : confirming.row.version !== '-'
      ? fmt(t('confirmUninstall'), confirming.row.name, confirming.row.version)
      : fmt(t('confirmUninstallNoVer'), confirming.row.name)

  return (
    // @ts-expect-error Modal 为运行时注入的组件，类型由宿主保证
    <Modal
      open={true}
      onClose={onClose}
      title={title}
      description={isUpdate ? t('updateTitle') : t('uninstallTitle')}
      footer={
        <Fragment>
          {/* @ts-expect-error Button 为运行时注入 */}
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          {/* @ts-expect-error Button 为运行时注入 */}
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              onConfirm(confirming.kind, confirming.row)
            }}
          >
            {isUpdate ? t('update') : t('uninstall')}
          </Button>
        </Fragment>
      }
    >
      {confirming.row.self ? (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--dsw-alias-label-tertiary,#888)',
            marginTop: '4px',
            marginBottom: '0',
          }}
        >
          {isUpdate ? t('confirmUpdateSelf') : t('confirmSelf')}
        </p>
      ) : null}
    </Modal>
  )
}
