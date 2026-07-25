/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-23
 * Prompt Summary: 工作流步骤参数编辑 hook(JSON 往返:参数取值 + 输入/输出参数字段定义)
 * Context: 读取/回写 data.nodes[i] 的 param(取值)与 input_params/output_params(字段定义)
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback } from 'react'
import {
  deriveInputParams,
  parseParamFields,
  serializeParamFields
} from '../utils/workflowParams'
import type { ParamField } from '../utils/workflowParams'

// 节点的完整可编辑草稿:取值 + 输入/输出字段定义
export interface NodeDraft {
  values: Record<string, unknown>
  inputParams: ParamField[]
  outputParams: ParamField[]
}

interface UseWorkflowStepEditorResult {
  // 读取指定节点的草稿(取值 + 字段定义);无 input_params 时由 param 推断
  readNodeDraft: (source: string, stepIndex: number) => NodeDraft
  // 将草稿写回 JSON 文本,返回新文本(失败返回 null)
  writeNodeDraft: (source: string, stepIndex: number, draft: NodeDraft) => string | null
}

// 工作流节点编辑:围绕 data.nodes[i] 的 param / input_params / output_params
export function useWorkflowStepEditor(): UseWorkflowStepEditorResult {
  const readNodeDraft = useCallback((source: string, stepIndex: number): NodeDraft => {
    const node = asRecord(jsonNodes(safeParseJson(source))[stepIndex])
    const values = asRecord(node.param)
    const storedInput = parseParamFields(node.input_params)
    return {
      values,
      // 节点未显式定义输入参数时,由既有 param 键推断,便于示例数据直接呈现
      inputParams: storedInput.length > 0 ? storedInput : deriveInputParams(values),
      outputParams: parseParamFields(node.output_params)
    }
  }, [])

  const writeNodeDraft = useCallback(
    (source: string, stepIndex: number, draft: NodeDraft): string | null => {
      const doc = safeParseJson(source)
      if (!doc) return null
      const node = jsonNodes(doc)[stepIndex]
      if (!node || typeof node !== 'object') return null

      const record = node as Record<string, unknown>
      // 合并取值:保留原有复杂对象(resource 等)不被覆盖
      record.param = { ...asRecord(record.param), ...draft.values }
      record.input_params = serializeParamFields(draft.inputParams)
      record.output_params = serializeParamFields(draft.outputParams)

      try {
        return `${JSON.stringify(doc, null, 2)}\n`
      } catch {
        return null
      }
    },
    []
  )

  return { readNodeDraft, writeNodeDraft }
}

// 取 JSON 工作流的节点数组(兼容 data.nodes 或顶层 nodes)
function jsonNodes(doc: Record<string, unknown> | null): unknown[] {
  if (!doc) return []
  const data = asRecord(doc.data)
  const nodes = data.nodes ?? doc.nodes
  return Array.isArray(nodes) ? nodes : []
}

// 安全解析 JSON 为对象,失败返回 null
function safeParseJson(source: string): Record<string, unknown> | null {
  try {
    const doc = JSON.parse(source)
    return doc && typeof doc === 'object' ? (doc as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}
