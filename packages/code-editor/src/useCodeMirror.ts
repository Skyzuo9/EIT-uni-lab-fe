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
import { Compartment, EditorState } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  highlightActiveLine,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { python } from '@codemirror/lang-python'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Extension } from '@codemirror/state'

export type EditorLanguage = 'yaml' | 'json' | 'python'

export interface CodeLineMarker {
  line: number
  kind:
    | 'before-start'
    | 'start'
    | 'breakpoint'
    | 'paused'
    | 'running'
    | 'success'
    | 'failed'
    | 'skipped'
  label: string
}

export interface UseCodeMirrorResult {
  value: string
  isDirty: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  replaceContent: (next: string) => void
  markSaved: () => void
  setLineMarkers: (markers: ReadonlyArray<CodeLineMarker>) => void
  revealLine: (line: number) => void
}

class CodeMarkerWidget extends WidgetType {
  constructor(private readonly marker: CodeLineMarker) {
    super()
  }

  eq(other: CodeMarkerWidget): boolean {
    return (
      other.marker.kind === this.marker.kind &&
      other.marker.label === this.marker.label
    )
  }

  toDOM(): HTMLElement {
    const element = document.createElement('span')
    element.className = `cm-workflow-marker cm-workflow-marker--${this.marker.kind}`
    element.textContent = this.marker.label
    element.title = this.marker.label
    return element
  }
}

function markerExtension(markers: ReadonlyArray<CodeLineMarker>): Extension {
  return EditorView.decorations.compute([], (state) => {
    const grouped = new Map<number, CodeLineMarker[]>()
    for (const marker of markers) {
      const line = Math.max(1, Math.min(marker.line, state.doc.lines))
      const current = grouped.get(line) || []
      current.push(marker)
      grouped.set(line, current)
    }
    const ranges = [...grouped.entries()]
      .sort(([left], [right]) => left - right)
      .flatMap(([lineNumber, lineMarkers]) => {
        const line = state.doc.line(lineNumber)
        const classes = lineMarkers
          .map((marker) => `cm-workflow-line--${marker.kind}`)
          .join(' ')
        return [
          Decoration.line({
            attributes: { class: `cm-workflow-line ${classes}` }
          }).range(line.from),
          ...lineMarkers.map((marker, index) => (
            Decoration.widget({
              widget: new CodeMarkerWidget(marker),
              side: -20 + index
            }).range(line.from)
          ))
        ]
      })
    return Decoration.set(ranges, true)
  })
}

// 按语言返回对应的语法扩展;JSON 复用 YAML 高亮(JSON 是 YAML 子集)
function languageExtension(language: EditorLanguage): Extension {
  return language === 'python' ? python() : yaml()
}

// 管理 CodeMirror 6 实例:挂载、内容同步、isDirty 判定、语言切换
export function useCodeMirror(
  initialValue: string,
  language: EditorLanguage
): UseCodeMirrorResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const markerCompartment = useRef(new Compartment())
  const markersRef = useRef<ReadonlyArray<CodeLineMarker>>([])
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
        markerCompartment.current.of(markerExtension(markersRef.current)),
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

  // 标记为已保存:把当前内容设为新基准(isDirty 归零),不改动文档
  const markSaved = useCallback(() => {
    const current = viewRef.current?.state.doc.toString()
    if (current != null) setBaseline(current)
  }, [])

  const setLineMarkers = useCallback((
    markers: ReadonlyArray<CodeLineMarker>
  ) => {
    markersRef.current = [...markers]
    const view = viewRef.current
    if (view) {
      view.dispatch({
        effects: markerCompartment.current.reconfigure(
          markerExtension(markersRef.current)
        )
      })
    }
  }, [])

  const revealLine = useCallback((lineNumber: number) => {
    const view = viewRef.current
    if (!view) return
    const line = view.state.doc.line(
      Math.max(1, Math.min(lineNumber, view.state.doc.lines))
    )
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' })
    })
    view.focus()
  }, [])

  return {
    value,
    isDirty: value !== baseline,
    containerRef,
    replaceContent,
    markSaved,
    setLineMarkers,
    revealLine
  }
}
