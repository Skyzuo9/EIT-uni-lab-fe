import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button, Input, NativeSelect, Textarea } from '@unilab/design-system'

import type {
  CustomParameter,
  ReagentContainerOption,
  ReagentCreateCommand,
  ReagentInfoProjection,
  ReagentInventoryProjection,
  ReagentUpdateCommand
} from '../types'
import { uiClass } from '../uiClasses'
import styles from '../workstation.module.scss'
import {
  ReagentDialogActions,
  ReagentDialogFrame,
  reagentDialogErrorMessage
} from './ReagentDialogPrimitives'
import { isValidCAS, optionalNumber, textValue } from './reagentFormValues'
import { CustomParameterFields } from './CustomParameterFields'

type EditorProps = {
  containers: readonly ReagentContainerOption[]
  infos?: readonly ReagentInfoProjection[]
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
  const [selectedInfoId, setSelectedInfoId] = useState(props.infos?.[0]?.id ?? '')
  const [customParameters, setCustomParameters] = useState<CustomParameter[]>([])
  const selectedInfo = props.infos?.find(info => info.id === selectedInfoId)

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
          metadata: {
            supplier: values.supplier,
            density_condition: values.densityCondition,
            expires_on: values.expiresOn,
            custom_parameters: customParameters
          },
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
        ? '从试剂库选择身份并补充实际密度、供应商、数量和有效期；空容器仍从 Backend 物料中选择。'
        : `修订 ${props.item.revision ?? '未知'} · 容器 ${props.item.lotLabel ?? props.item.materialId ?? '未知'}`}
      busy={submitting}
      wide={props.mode === 'create'}
      onClose={props.onClose}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className={`${styles.dialogFields} ${props.mode === 'create' ? styles.reagentRegistrationFields : ''}`}>
          {props.mode === 'create' ? (
            <>
              <div className={styles.reagentContainerField}>
                <span>空容器物料</span>
                <ContainerSearchSelect
                  containers={availableContainers}
                  disabled={noAvailableContainer}
                />
              </div>
              <label>
                <span>选择试剂</span>
                <NativeSelect
                  value={selectedInfoId}
                  required
                  onChange={event => setSelectedInfoId(event.target.value)}
                >
                  <option value="" disabled>请选择试剂库中的基础信息</option>
                  {(props.infos ?? []).map(info => (
                    <option key={info.id} value={info.id}>
                      {info.name}{info.cas ? ` · ${info.cas}` : ''}
                    </option>
                  ))}
                </NativeSelect>
                <input type="hidden" name="cas" value={selectedInfo?.cas ?? ''} />
                <input type="hidden" name="physicalState" value={selectedInfo?.physicalState ?? 'unknown'} />
              </label>
              <label>
                <span>实际密度（g/mL）</span>
                <Input
                  key={selectedInfoId}
                  name="densityGPerMl"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  defaultValue={selectedInfo?.densityGPerMl ?? ''}
                />
              </label>
              <label>
                <span>密度测定条件</span>
                <Input name="densityCondition" defaultValue="20℃" maxLength={64} />
              </label>
              <label>
                <span>供应商</span>
                <Input name="supplier" maxLength={255} />
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
            <Input
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
            <span>单位</span>
            <Input
              name="quantityUnit"
              defaultValue={initial?.unit ?? 'mL'}
              readOnly={props.mode === 'edit'}
              maxLength={32}
              required
            />
            {props.mode === 'edit' ? <small>Backend 不允许在试剂生命周期内修改单位。</small> : null}
          </label>
          {props.mode === 'create' ? (
            <label>
              <span>有效期</span>
              <Input name="expiresOn" type="date" defaultValue={defaultReagentExpiryDate()} />
            </label>
          ) : null}
          {props.mode === 'create' ? null : (
          <label>
            <span>浓度数值（可选）</span>
            <Input
              name="concentrationValue"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              defaultValue={initial?.concentrationValue ?? ''}
            />
          </label>
          )}
          {props.mode === 'create' ? null : (
          <label>
            <span>浓度单位</span>
            <Input
              name="concentrationUnit"
              maxLength={32}
              placeholder="例如 %、mol/L"
              defaultValue={initial?.concentrationUnit ?? ''}
            />
          </label>
          )}
          {props.mode === 'create' ? null : (
          <label className={styles.dialogFieldWide}>
            <span>说明（可选）</span>
            <Textarea name="description" rows={3} maxLength={1000} defaultValue={initial?.description ?? ''} />
          </label>
          )}
        </div>
        {props.mode === 'create' ? (
          <CustomParameterFields value={customParameters} onChange={setCustomParameters} />
        ) : null}
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

/** 使用独立触发器与搜索浮层完成空容器选择。 */
function ContainerSearchSelect({
  containers,
  disabled
}: {
  containers: readonly ReagentContainerOption[]
  disabled: boolean
}): React.JSX.Element {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const selected = containers.find(container => container.id === selectedId)
  const options = useMemo(
    () => filterReagentContainers(containers, query),
    [containers, query]
  )

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  function select(container: ReagentContainerOption): void {
    setSelectedId(container.id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className={styles.reagentContainerSelect}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <input type="hidden" name="materialId" value={selectedId} />
      <Button
        type="button"
        variant="outline"
        className={styles.reagentContainerSelectControl}
        data-dialog-initial-focus
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      >
        <span className={selected ? styles.reagentContainerSelectValue : styles.reagentContainerSelectPlaceholder}>
          {selected ? reagentContainerLabel(selected) : '请选择空容器物料'}
        </span>
        <span aria-hidden="true" className={styles.reagentContainerSelectArrow} />
      </Button>
      <div
        className={styles.reagentContainerSelectPopup}
        hidden={!open}
      >
        <Input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="搜索名称、条码或 UUID"
          aria-label="搜索空容器物料"
          aria-autocomplete="list"
          aria-controls={listboxId}
          role="combobox"
          autoComplete="off"
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setOpen(false)
              rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
            } else if (event.key === 'Enter' && options[0]) {
              event.preventDefault()
              select(options[0])
            }
          }}
        />
        <div id={listboxId} role="listbox" className={styles.reagentContainerSelectMenu}>
          {options.length > 0 ? options.map(container => (
            <Button
              key={container.id}
              type="button"
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={container.id === selectedId}
              onClick={() => select(container)}
            >
              <span>
                <strong>{container.name}</strong>
                <small>{container.barcode || container.id}</small>
              </span>
              {container.id === selectedId ? <b aria-hidden="true">✓</b> : null}
            </Button>
          )) : (
            <p>没有匹配的空容器物料</p>
          )}
        </div>
      </div>
    </div>
  )
}

function reagentContainerLabel(container: ReagentContainerOption): string {
  return `${container.name} · ${container.barcode || container.id}`
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
          <Input
            data-dialog-initial-focus
            value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
        {error ? <p className={styles.dialogError} role="alert">{error}</p> : null}
      </div>
      <div className={uiClass.dialogActions}>
        <Button variant="outline" disabled={submitting} onClick={onClose}>取消</Button>
        <Button
          variant="destructive"
          type="button"
          disabled={submitting || confirmation !== '删除'}
          onClick={() => void handleDelete()}
        >
          {submitting ? '正在删除…' : '确认软删除'}
        </Button>
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
  supplier?: string
  densityCondition?: string
  expiresOn?: string
}

/** 从浏览器 FormData 读取试剂表单值，空数值保持 undefined。 */
function reagentEditorValues(form: FormData): EditorValues {
  const densityGPerMl = optionalNumber(form.get('densityGPerMl'))
  const concentrationValue = optionalNumber(form.get('concentrationValue'))
  const description = textValue(form, 'description')
  const concentrationUnit = textValue(form, 'concentrationUnit')
  const supplier = textValue(form, 'supplier')
  const densityCondition = textValue(form, 'densityCondition')
  const expiresOn = textValue(form, 'expiresOn')
  return {
    materialId: textValue(form, 'materialId'),
    cas: textValue(form, 'cas'),
    physicalState: (textValue(form, 'physicalState') || 'unknown') as EditorValues['physicalState'],
    ...(densityGPerMl == null ? {} : { densityGPerMl }),
    quantity: Number(form.get('quantity')),
    quantityUnit: textValue(form, 'quantityUnit'),
    ...(concentrationValue == null ? {} : { concentrationValue }),
    ...(concentrationUnit ? { concentrationUnit } : {}),
    ...(description ? { description } : {}),
    ...(supplier ? { supplier } : {}),
    ...(densityCondition ? { densityCondition } : {}),
    ...(expiresOn ? { expiresOn } : {})
  }
}

function defaultReagentExpiryDate(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 2)
  return date.toISOString().slice(0, 10)
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
