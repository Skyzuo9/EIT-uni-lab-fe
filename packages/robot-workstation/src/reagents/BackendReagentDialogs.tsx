import { useMemo, useState } from 'react'

import type {
  ReagentContainerOption,
  ReagentCreateCommand,
  ReagentInventoryProjection,
  ReagentUpdateCommand
} from '../types'
import { buttonClass, uiClass } from '../uiClasses'
import styles from '../workstation.module.scss'
import {
  ReagentDialogActions,
  ReagentDialogFrame,
  reagentDialogErrorMessage
} from './ReagentDialogPrimitives'
import { isValidCAS, optionalNumber, textValue } from './reagentFormValues'

type EditorProps = {
  containers: readonly ReagentContainerOption[]
  occupiedMaterialIds: ReadonlySet<string>
  onClose: () => void
} & (
  | {
      mode: 'create'
      onSave: (command: ReagentCreateCommand) => Promise<void>
    }
  | {
      mode: 'edit'
      item: ReagentInventoryProjection
      onSave: (command: ReagentUpdateCommand) => Promise<void>
    }
)

/**
 * 编辑 Backend 试剂实例；创建时选择既有容器，更新时固定身份和计量单位。
 * @param props 创建或编辑上下文、容器目录和真实写入回调。
 * @returns 支持键盘焦点约束、内联校验和提交错误恢复的模态表单。
 */
export function BackendReagentEditorDialog(props: EditorProps): React.JSX.Element {
  const availableContainers = useMemo(
    () => props.containers.filter(container =>
      !props.occupiedMaterialIds.has(container.id)
    ),
    [props.containers, props.occupiedMaterialIds]
  )
  const initial = props.mode === 'edit' ? props.item : undefined
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [containerQuery, setContainerQuery] = useState('')
  const [selectedMaterialId, setSelectedMaterialId] = useState('')
  const visibleContainers = useMemo(
    () => filterReagentContainers(availableContainers, containerQuery),
    [availableContainers, containerQuery]
  )

  /** 校验完整表单并向 Backend 提交一次创建或乐观修订更新。 */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return
    const form = new FormData(event.currentTarget)
    const values = reagentEditorValues(form)
    const validationError = validateReagentEditor(values, props.mode)
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (props.mode === 'create') {
        await props.onSave({
          materialId: values.materialId,
          cas: values.cas,
          physicalState: values.physicalState,
          ...(values.densityGPerMl == null ? {} : { densityGPerMl: values.densityGPerMl }),
          ...concentrationCommand(values),
          quantity: values.quantity,
          quantityUnit: values.quantityUnit,
          ...(values.description ? { description: values.description } : {})
        })
      } else {
        await props.onSave({
          id: props.item.id,
          quantity: values.quantity,
          quantityUnit: props.item.unit ?? values.quantityUnit,
          expectedRevision: props.item.revision ?? 0,
          ...concentrationCommand(values),
          ...(values.description ? { description: values.description } : {}),
          ...(props.item.metadata ? { metadata: props.item.metadata } : {})
        })
      }
    } catch (submitError) {
      setError(reagentDialogErrorMessage(submitError, '试剂保存失败，请检查连接后重试。'))
      setSubmitting(false)
    }
  }

  const noAvailableContainer = props.mode === 'create' && availableContainers.length === 0
  return (
    <ReagentDialogFrame
      title={props.mode === 'create' ? '试剂登记' : `编辑 ${props.item.name}`}
      description={props.mode === 'create'
        ? '选择 Backend 中已存在且尚未承载试剂的容器物料；CAS 化学身份由 Backend 查询并保存。'
        : `修订 ${props.item.revision ?? '未知'} · 容器 ${props.item.lotLabel ?? props.item.materialId ?? '未知'}`}
      busy={submitting}
      onClose={props.onClose}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className={styles.dialogFields}>
          {props.mode === 'create' ? (
            <>
              <label className={styles.dialogFieldWide}>
                <span>空容器物料</span>
                <div className={styles.reagentContainerSelector}>
                  <input
                    type="search"
                    value={containerQuery}
                    data-dialog-initial-focus
                    placeholder="搜索物料名称、条码或 UUID"
                    aria-label="搜索空容器物料"
                    autoComplete="off"
                    disabled={noAvailableContainer}
                    onChange={event => {
                      setContainerQuery(event.target.value)
                      setSelectedMaterialId('')
                    }}
                  />
                  <select
                    name="materialId"
                    value={selectedMaterialId}
                    required
                    disabled={noAvailableContainer || visibleContainers.length === 0}
                    aria-label="选择空容器物料"
                    onChange={event => setSelectedMaterialId(event.target.value)}
                  >
                    <option value="" disabled>
                      {visibleContainers.length === 0 && containerQuery.trim()
                        ? '没有匹配的空容器物料'
                        : '请选择空容器物料'}
                    </option>
                    {visibleContainers.map(container => (
                      <option key={container.id} value={container.id}>
                        {container.name} · {container.barcode || container.id}
                      </option>
                    ))}
                  </select>
                </div>
                <small>Backend 会再次校验资源模板是否带有 container 标签且内容为空。</small>
              </label>
              <label>
                <span>CAS 号</span>
                <input name="cas" placeholder="例如 64-17-5" maxLength={64} required />
              </label>
              <label>
                <span>常温物态</span>
                <select name="physicalState" defaultValue="unknown">
                  <option value="unknown">未知</option>
                  <option value="liquid">液体</option>
                  <option value="solid">固体</option>
                  <option value="gas">气体</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label>
                <span>密度（g/mL，可选）</span>
                <input name="densityGPerMl" type="number" min="0" step="any" inputMode="decimal" />
              </label>
            </>
          ) : (
            <div className={styles.reagentIdentitySummary}>
              <span>{props.item.cas ?? 'CAS 未提供'}</span>
              <strong>{props.item.name}</strong>
              <small>{props.item.molecularFormula ?? props.item.reagentInfoId ?? '化学身份未完整返回'}</small>
            </div>
          )}
          <label>
            <span>{props.mode === 'create' ? '初始数量' : '当前数量'}</span>
            <input
              name="quantity"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              defaultValue={initial?.totalQuantity ?? ''}
              data-dialog-initial-focus={props.mode === 'edit' || undefined}
              required
            />
          </label>
          <label>
            <span>计量单位</span>
            <input
              name="quantityUnit"
              defaultValue={initial?.unit ?? 'mL'}
              readOnly={props.mode === 'edit'}
              maxLength={32}
              required
            />
            {props.mode === 'edit' ? <small>Backend 不允许在试剂生命周期内修改单位。</small> : null}
          </label>
          <label>
            <span>浓度数值（可选）</span>
            <input
              name="concentrationValue"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              defaultValue={initial?.concentrationValue ?? ''}
            />
          </label>
          <label>
            <span>浓度单位</span>
            <input
              name="concentrationUnit"
              maxLength={32}
              placeholder="例如 %、mol/L"
              defaultValue={initial?.concentrationUnit ?? ''}
            />
          </label>
          <label className={styles.dialogFieldWide}>
            <span>说明（可选）</span>
            <textarea name="description" rows={3} maxLength={1000} defaultValue={initial?.description ?? ''} />
          </label>
        </div>
        {noAvailableContainer ? (
          <p className={styles.dialogError} role="alert">
            没有可选容器物料。请先在物料模块创建带 container 标签的空容器。
          </p>
        ) : null}
        {error ? <p className={styles.dialogError} role="alert">{error}</p> : null}
        <ReagentDialogActions
          onClose={props.onClose}
          submitLabel={submitting ? '正在保存…' : props.mode === 'create' ? '确认登记' : '保存修改'}
          disabled={submitting || noAvailableContainer}
        />
      </form>
    </ReagentDialogFrame>
  )
}

/**
 * 对 Backend 试剂软删除提供显式范围和文字确认。
 * @param props 待删除试剂、异步删除回调和关闭回调。
 * @returns 只有输入“删除”后才可提交的危险操作模态框。
 */
export function BackendReagentDeleteDialog({
  item,
  onDelete,
  onClose
}: {
  item: ReagentInventoryProjection
  onDelete: () => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  /** 提交软删除并等待 Backend 台账闭合完成。 */
  async function handleDelete(): Promise<void> {
    if (submitting || confirmation !== '删除') return
    setSubmitting(true)
    setError('')
    try {
      await onDelete()
    } catch (deleteError) {
      setError(reagentDialogErrorMessage(deleteError, '试剂删除失败，请刷新后重试。'))
      setSubmitting(false)
    }
  }

  return (
    <ReagentDialogFrame
      title={`删除 ${item.name}`}
      description={`Backend 会将 ${formatQuantity(item.totalQuantity, item.unit)} 余量闭合为零、追加 remove 台账并软删除试剂；被任务预留或修订冲突时会拒绝。`}
      busy={submitting}
      onClose={onClose}
    >
      <div className={styles.deleteConfirmation}>
        <label>
          <span>输入“删除”确认</span>
          <input
            data-dialog-initial-focus
            value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
        {error ? <p className={styles.dialogError} role="alert">{error}</p> : null}
      </div>
      <div className={uiClass.dialogActions}>
        <button className={buttonClass()} type="button" disabled={submitting} onClick={onClose}>取消</button>
        <button
          className={buttonClass('danger')}
          type="button"
          disabled={submitting || confirmation !== '删除'}
          onClick={() => void handleDelete()}
        >
          {submitting ? '正在删除…' : '确认软删除'}
        </button>
      </div>
    </ReagentDialogFrame>
  )
}

interface EditorValues {
  materialId: string
  cas: string
  physicalState: ReagentCreateCommand['physicalState']
  densityGPerMl?: number
  quantity: number
  quantityUnit: string
  concentrationValue?: number
  concentrationUnit?: string
  description?: string
}

/** 从浏览器 FormData 读取试剂表单值，空数值保持 undefined。 */
function reagentEditorValues(form: FormData): EditorValues {
  const densityGPerMl = optionalNumber(form.get('densityGPerMl'))
  const concentrationValue = optionalNumber(form.get('concentrationValue'))
  const description = textValue(form, 'description')
  const concentrationUnit = textValue(form, 'concentrationUnit')
  return {
    materialId: textValue(form, 'materialId'),
    cas: textValue(form, 'cas'),
    physicalState: (textValue(form, 'physicalState') || 'unknown') as EditorValues['physicalState'],
    ...(densityGPerMl == null ? {} : { densityGPerMl }),
    quantity: Number(form.get('quantity')),
    quantityUnit: textValue(form, 'quantityUnit'),
    ...(concentrationValue == null ? {} : { concentrationValue }),
    ...(concentrationUnit ? { concentrationUnit } : {}),
    ...(description ? { description } : {})
  }
}

/**
 * 校验 Backend 试剂创建和更新共同不变量。
 * @param values 规范化后的表单值。
 * @param mode 创建时额外校验容器和 CAS，编辑时保持既有身份。
 * @returns 第一个可行动错误；合法时返回 null。
 */
export function validateReagentEditor(
  values: EditorValues,
  mode: 'create' | 'edit'
): string | null {
  if (mode === 'create' && !values.materialId) return '请选择空容器物料'
  if (mode === 'create' && !isValidCAS(values.cas)) return '请输入校验位正确的 CAS 号'
  if (!Number.isFinite(values.quantity) || values.quantity < 0) return '数量必须是大于等于零的有限数'
  if (!values.quantityUnit) return '计量单位不能为空'
  if (values.densityGPerMl != null && (!Number.isFinite(values.densityGPerMl) || values.densityGPerMl <= 0)) {
    return '密度必须是大于零的有限数'
  }
  if ((values.concentrationValue == null) !== !values.concentrationUnit) {
    return '浓度数值和单位必须同时填写或同时留空'
  }
  if (values.concentrationValue != null && (!Number.isFinite(values.concentrationValue) || values.concentrationValue < 0)) {
    return '浓度必须是大于等于零的有限数'
  }
  return null
}

/** 按名称、条码或稳定 UUID 筛选空容器候选。 */
export function filterReagentContainers(
  containers: readonly ReagentContainerOption[],
  query: string
): readonly ReagentContainerOption[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) return containers
  return containers.filter(container => [
    container.name,
    container.barcode,
    container.id
  ].some(value => value?.toLocaleLowerCase('zh-CN').includes(normalized)))
}

/** 将可选浓度投影为成对命令字段。 */
function concentrationCommand(values: EditorValues): Pick<
  ReagentCreateCommand,
  'concentrationValue' | 'concentrationUnit'
> {
  return values.concentrationValue == null || !values.concentrationUnit
    ? {}
    : {
        concentrationValue: values.concentrationValue,
        concentrationUnit: values.concentrationUnit
      }
}

/** 格式化当前权威数量；缺失时保留未知。 */
function formatQuantity(value: number | undefined, unit: string | undefined): string {
  return value == null ? '未知数量' : `${value.toLocaleString('zh-CN')} ${unit ?? ''}`.trim()
}
