/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-24
 * Prompt Summary: 工作流节点输入/输出参数字段的类型定义与解析辅助(供字段列表编辑器)
 * Context: 节点编辑抽屉支持增删多个输入/输出参数;字段含变量名/类型/必填,可从既有 param 推断
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */

// 参数字段的值类型(与 JSON Schema 常见标量/复合类型对齐)
export type ParamValueType = 'string' | 'number' | 'boolean' | 'array' | 'object'

// 单个输入/输出参数字段定义
export interface ParamField {
  name: string
  type: ParamValueType
  required: boolean
}

// 类型下拉可选项(中文标签)
export const PARAM_TYPE_OPTIONS: { value: ParamValueType; label: string }[] = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'array', label: '数组' },
  { value: 'object', label: '对象' }
]

// 右侧类型徽标符号(参考大 web/Dify 字段列表的紧凑标识)
const TYPE_BADGE: Record<ParamValueType, string> = {
  string: 'Aa',
  number: '#',
  boolean: '01',
  array: '[ ]',
  object: '{ }'
}

// 取类型的紧凑徽标符号
export function getParamTypeBadge(type: ParamValueType): string {
  return TYPE_BADGE[type] ?? 'Aa'
}

// 由具体值推断参数类型
export function inferParamType(value: unknown): ParamValueType {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (value && typeof value === 'object') return 'object'
  return 'string'
}

// 新建一个空字段(默认文本、非必填)
export function emptyParamField(): ParamField {
  return { name: '', type: 'string', required: false }
}

// 由既有 param 对象推断输入参数字段(节点无 input_params 时的初始种子)
export function deriveInputParams(param: Record<string, unknown>): ParamField[] {
  return Object.entries(param).map(([name, value]) => ({
    name,
    type: inferParamType(value),
    required: false
  }))
}

// 解析已存储的字段数组(容错:非法项跳过,类型非法回退为 string)
export function parseParamFields(raw: unknown): ParamField[] {
  if (!Array.isArray(raw)) return []
  const fields: ParamField[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : ''
    if (!name) continue
    fields.push({
      name,
      type: normalizeType(record.type),
      required: record.required === true
    })
  }
  return fields
}

// 将字段数组序列化为可写回 JSON 的普通对象数组
export function serializeParamFields(fields: ParamField[]): Record<string, unknown>[] {
  return fields
    .filter((field) => field.name.trim() !== '')
    .map((field) => ({ name: field.name.trim(), type: field.type, required: field.required }))
}

// 归一化类型字符串,非法值回退为 string
function normalizeType(value: unknown): ParamValueType {
  const options = PARAM_TYPE_OPTIONS.map((option) => option.value)
  return options.includes(value as ParamValueType) ? (value as ParamValueType) : 'string'
}
