// 确认模态框：更新 / 卸载 二次确认（dshmarket 同款平台 Modal）。
// 无平台原语时调用方应回退原生 window.confirm，不渲染本组件。

import { getReact, getRequire } from '../runtime'
import { fmt } from '../i18n'
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
  [name: string]: { latest: string } | undefined
}

export interface ConfirmModalProps {
  confirming: ConfirmState | null
  updates: UpdatesMap
  t: (key: string) => string
  onClose: () => void
  onConfirm: (kind: 'update' | 'uninstall', row: ConfirmRow) => void
}

export function ConfirmModal(props: ConfirmModalProps): ReactElement | null {
  const { confirming, updates, t, onClose, onConfirm } = props
  const React = getReact()
  const { Fragment } = React

  // 运行时探测平台 Modal / Button（dshmarket 同款）。
  let Modal: unknown = null
  let Button: unknown = null
  try {
    const req = getRequire()
    const p = req('@deepseek-ai/dsh-client-ui-primitives')
    Modal = typeof p?.Modal === 'function' ? p.Modal : null
    Button = typeof p?.Button === 'function' ? p.Button : null
  } catch {
    Modal = null
    Button = null
  }
  const hasModal = Modal !== null && Button !== null

  if (confirming === null || !hasModal) return null

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
