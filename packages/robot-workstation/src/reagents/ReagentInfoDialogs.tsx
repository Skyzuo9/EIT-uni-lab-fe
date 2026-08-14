import { useState } from 'react'

import type {
  ReagentInfoCreateCommand,
  ReagentInfoProjection,
  ReagentInfoUpdateCommand,
  ReagentPhysicalState
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
  onClose: () => void
} & (
  | {
      mode: 'create'
      onSave: (command: ReagentInfoCreateCommand) => Promise<void>
    }
  | {
      mode: 'edit'
      item: ReagentInfoProjection
      onSave: (command: ReagentInfoUpdateCommand) => Promise<void>
    }
)

/**
 * 手工登记或纠错 Backend 化学品字典身份。
 * @param props 创建/编辑上下文、真实写入回调和关闭回调。
 * @returns 支持可空 CAS、完整化学字段和错误恢复的模态表单。
 */
export function ReagentInfoEditorDialog(props: EditorProps): React.JSX.Element {
  const initial = props.mode === 'edit' ? props.item : undefined
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  /** 读取并校验完整化学身份，只向上层提交一次 Backend 命令。 */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return
    const values = reagentInfoEditorValues(new FormData(event.currentTarget))
    const validationError = validateReagentInfoEditor(values)
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const command = reagentInfoCommand(values, initial?.metadata)
      if (props.mode === 'create') {
        await props.onSave(command)
      } else {
        await props.onSave({ ...command, id: props.item.id })
      }
    } catch (submitError) {
      setError(reagentDialogErrorMessage(
        submitError,
        '试剂基础信息保存失败，请检查字段或连接后重试。'
      ))
      setSubmitting(false)
    }
  }

  return (
    <ReagentDialogFrame
      title={props.mode === 'create' ? '新增试剂基础信息' : `编辑 ${props.item.name}`}
      description={props.mode === 'create'
        ? '先登记独立化学品身份；这一步不会创建容器、库存实例或余量。CAS 可留空。'
        : '纠错会更新共享化学身份；已登记试剂实例的数量、密度和物态不会被前端联动改写。'}
      busy={submitting}
      onClose={props.onClose}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className={styles.dialogFields}>
          <label>
            <span>试剂名称</span>
            <input name="name" defaultValue={initial?.name ?? ''} maxLength={255} required data-dialog-initial-focus />
          </label>
          <label>
            <span>英文名称（可选）</span>
            <input name="nameEn" defaultValue={initial?.nameEn ?? ''} maxLength={255} />
          </label>
          <label>
            <span>CAS 号（可选）</span>
            <input name="cas" defaultValue={initial?.cas ?? ''} placeholder="例如 64-17-5" maxLength={64} />
            <small>没有登记号的自配物质可以留空；填写后按 CAS 校验位验证。</small>
          </label>
          <label>
            <span>常温物态</span>
            <select name="physicalState" defaultValue={initial?.physicalState ?? 'unknown'}>
              <option value="unknown">未知</option>
              <option value="liquid">液体</option>
              <option value="solid">固体</option>
              <option value="gas">气体</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label>
            <span>分子式（可选）</span>
            <input name="molecularFormula" defaultValue={initial?.molecularFormula ?? ''} />
          </label>
          <label>
            <span>分子量（g/mol，可选）</span>
            <input name="molecularWeight" type="number" min="0" step="any" inputMode="decimal" defaultValue={initial?.molecularWeight ?? ''} />
          </label>
          <label>
            <span>参考密度（g/mL，可选）</span>
            <input name="densityGPerMl" type="number" min="0" step="any" inputMode="decimal" defaultValue={initial?.densityGPerMl ?? ''} />
          </label>
          <label>
            <span>别名（可选）</span>
            <input name="aliases" defaultValue={initial?.aliases.join('，') ?? ''} placeholder="用逗号分隔多个别名" />
          </label>
          <label className={styles.dialogFieldWide}>
            <span>SMILES（可选）</span>
            <input name="smiles" className={uiClass.mono} defaultValue={initial?.smiles ?? ''} />
          </label>
          <label className={styles.dialogFieldWide}>
            <span>InChIKey（可选）</span>
            <input name="inchiKey" className={uiClass.mono} defaultValue={initial?.inchiKey ?? ''} maxLength={64} />
          </label>
          <label className={styles.dialogFieldWide}>
            <span>说明（可选）</span>
            <textarea name="description" rows={3} maxLength={1000} defaultValue={initial?.description ?? ''} />
          </label>
        </div>
        {error ? <p className={styles.dialogError} role="alert">{error}</p> : null}
        <ReagentDialogActions
          onClose={props.onClose}
          submitLabel={submitting ? '正在保存…' : props.mode === 'create' ? '确认新增' : '保存修改'}
          disabled={submitting}
        />
      </form>
    </ReagentDialogFrame>
  )
}

/**
 * 对化学品字典删除提供历史引用边界说明和文字确认。
 * @param props 待删除身份、异步删除回调和关闭回调。
 * @returns 只有输入“删除”后才可提交的危险操作模态框。
 */
export function ReagentInfoDeleteDialog({
  item,
  onDelete,
  onClose
}: {
  item: ReagentInfoProjection
  onDelete: () => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  /** 请求 Backend 删除误建身份，引用冲突时保留对话框和原始错误。 */
  async function handleDelete(): Promise<void> {
    if (submitting || confirmation !== '删除') return
    setSubmitting(true)
    setError('')
    try {
      await onDelete()
    } catch (deleteError) {
      setError(reagentDialogErrorMessage(
        deleteError,
        '试剂基础信息删除失败，请刷新后重试。'
      ))
      setSubmitting(false)
    }
  }

  return (
    <ReagentDialogFrame
      title={`删除 ${item.name}`}
      description="仅从未被库存、仓库或工作流历史引用的误建化学身份可以删除；有关联记录时 Backend 会拒绝并保留审计身份。"
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
          {submitting ? '正在删除…' : '确认删除身份'}
        </button>
      </div>
    </ReagentDialogFrame>
  )
}

export interface ReagentInfoEditorValues extends ReagentInfoCreateCommand {}

/**
 * 校验 Backend 化学品字典的当前必填项、CAS 校验位与正数参考属性。
 * @param values 已规范化的完整表单值。
 * @returns 第一个可行动错误；合法时返回 null。
 */
export function validateReagentInfoEditor(
  values: ReagentInfoEditorValues
): string | null {
  if (!values.name) return '试剂名称不能为空'
  if (values.cas && !isValidCAS(values.cas)) return 'CAS 号校验位不正确，请修正或留空'
  if (!isPhysicalState(values.physicalState)) return '请选择有效的常温物态'
  if (values.molecularWeight != null && (
    !Number.isFinite(values.molecularWeight) || values.molecularWeight <= 0
  )) return '分子量必须是大于零的有限数'
  if (values.densityGPerMl != null && (
    !Number.isFinite(values.densityGPerMl) || values.densityGPerMl <= 0
  )) return '参考密度必须是大于零的有限数'
  return null
}

/**
 * 从浏览器表单读取完整化学身份，空白可空字段保持 undefined。
 * @param form 浏览器 FormData。
 * @returns 已去空白、去重别名并保留可空语义的表单值。
 */
function reagentInfoEditorValues(form: FormData): ReagentInfoEditorValues {
  const aliases = [...new Set(textValue(form, 'aliases').split(/[,，;；\n]/)
    .map(alias => alias.trim()).filter(Boolean))]
  const physicalState = textValue(form, 'physicalState') as ReagentPhysicalState
  return {
    name: textValue(form, 'name'),
    aliases,
    physicalState,
    ...optionalTextCommand('nameEn', textValue(form, 'nameEn')),
    ...optionalTextCommand('cas', textValue(form, 'cas')),
    ...optionalTextCommand('molecularFormula', textValue(form, 'molecularFormula')),
    ...optionalTextCommand('smiles', textValue(form, 'smiles')),
    ...optionalTextCommand('inchiKey', textValue(form, 'inchiKey')),
    ...optionalNumberCommand('molecularWeight', optionalNumber(form.get('molecularWeight'))),
    ...optionalNumberCommand('densityGPerMl', optionalNumber(form.get('densityGPerMl'))),
    ...optionalTextCommand('description', textValue(form, 'description'))
  }
}

/**
 * 把表单值投影为写命令，并在编辑时原样保留不可见的 Backend 元数据。
 * @param values 已校验表单值。
 * @param metadata 既有权威元数据；创建时为空。
 * @returns 可交给 Workbench 数据适配层的创建命令。
 */
function reagentInfoCommand(
  values: ReagentInfoEditorValues,
  metadata?: Record<string, unknown>
): ReagentInfoCreateCommand {
  return { ...values, ...(metadata ? { metadata } : {}) }
}

/** 把非空文本映射到类型安全的可选命令字段。 */
function optionalTextCommand<Key extends keyof ReagentInfoCreateCommand>(
  key: Key,
  value: string
): Partial<Pick<ReagentInfoCreateCommand, Key>> {
  return value ? { [key]: value } as Partial<Pick<ReagentInfoCreateCommand, Key>> : {}
}

/** 把存在的数值映射到类型安全的可选命令字段。 */
function optionalNumberCommand<Key extends 'molecularWeight' | 'densityGPerMl'>(
  key: Key,
  value: number | undefined
): Partial<Pick<ReagentInfoCreateCommand, Key>> {
  return value == null ? {} : { [key]: value } as Pick<ReagentInfoCreateCommand, Key>
}

/** 判断未信任表单值是否属于 Backend 当前物态闭集。 */
function isPhysicalState(value: string): value is ReagentPhysicalState {
  return value === 'solid' || value === 'liquid' || value === 'gas' ||
    value === 'other' || value === 'unknown'
}
