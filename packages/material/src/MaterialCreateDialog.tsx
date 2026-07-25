import { useMemo, useState } from 'react'

import type { CapabilityStatus } from './MaterialCapabilityNotice'
import {
  createMaterialDraftFromTemplate,
  type MaterialTemplateDetail,
  type TemplateMaterialDraft
} from './templateMaterial'

export function MaterialCreateDialog({
  template,
  existingNames,
  createStatus,
  onCancel,
  onCreate
}: {
  template: MaterialTemplateDetail
  existingNames: readonly string[]
  createStatus: CapabilityStatus
  onCancel: () => void
  onCreate: (draft: TemplateMaterialDraft) => Promise<void> | void
}): React.JSX.Element {
  const [requestedName, setRequestedName] = useState(template.name)
  const [submitting, setSubmitting] = useState(false)
  const draft = useMemo(
    () =>
      createMaterialDraftFromTemplate(
        template,
        existingNames,
        requestedName
      ),
    [existingNames, requestedName, template]
  )

  const submit = async (): Promise<void> => {
    if (!createStatus.available || submitting) return
    setSubmitting(true)
    try {
      await onCreate(draft)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="material-dialog-backdrop">
      <section
        className="material-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-create-title"
      >
        <header>
          <div>
            <span>从模板创建</span>
            <h3 id="material-create-title">{template.name}</h3>
          </div>
          <button type="button" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="material-dialog__content">
          <label>
            实例名称
            <input
              value={requestedName}
              onChange={(event) => setRequestedName(event.target.value)}
              autoFocus
            />
          </label>

          <div className="material-dialog__summary">
            <span>类型</span>
            <strong>
              {template.resourceType === 'device' ? '设备' : '资源'}
            </strong>
            <span>配置项</span>
            <strong>{template.configInfos.length}</strong>
          </div>

          {draft.requiresLiquidConfiguration ? (
            <p className="material-dialog__notice">
              已按 Cloud 创建规则为液体孔位填入默认 Water 500。
            </p>
          ) : null}

          {!createStatus.available ? (
            <p className="material-dialog__disabled">
              {createStatus.reason ?? '当前 Profile 不支持创建物料'}
            </p>
          ) : null}
        </div>

        <footer>
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={
              !createStatus.available ||
              !requestedName.trim() ||
              submitting
            }
            title={createStatus.reason}
            onClick={() => void submit()}
          >
            {submitting ? '正在创建…' : '创建物料'}
          </button>
        </footer>
      </section>
    </div>
  )
}
