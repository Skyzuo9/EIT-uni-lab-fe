/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: CodeMirror 6 生命周期管理 hook(yaml/json 语言 + isDirty)
 * Context: 替换 textarea 编辑器,供设备(YAML)/工作流(JSON)方向复用
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Extension } from '@codemirror/state'

export type EditorLanguage = 'yaml' | 'json'

export interface UseCodeMirrorResult {
  value: string
  isDirty: boolean
  containerRef: React.RefObject<HTMLDivElement>
  replaceContent: (next: string) => void
}

// 按语言返回对应的语法扩展;JSON 复用 YAML 高亮(JSON 是 YAML 子集)
function languageExtension(_language: EditorLanguage): Extension {
  return yaml()
}

// 管理 CodeMirror 6 实例:挂载、内容同步、isDirty 判定、语言切换
export function useCodeMirror(
  initialValue: string,
  language: EditorLanguage
): UseCodeMirrorResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [value, setValue] = useState(initialValue)
  const [baseline, setBaseline] = useState(initialValue)

  // 初始化编辑器实例;语言变化时重建以套用新语法
  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) setValue(update.state.doc.toString())
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        bracketMatching(),
        indentOnInput(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        languageExtension(language),
        oneDark,
        EditorView.lineWrapping,
        updateListener
      ]
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 仅在语言变化时重建;value 变更通过 replaceContent 走 dispatch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  // 用外部内容整体替换,并作为新基准
  const replaceContent = useCallback((next: string) => {
    const view = viewRef.current
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next }
      })
    }
    setValue(next)
    setBaseline(next)
  }, [])

  return {
    value,
    isDirty: value !== baseline,
    containerRef,
    replaceContent
  }
}
