/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: CodeMirror 编辑器展示组件(标题栏 + 编辑区 + dirty 标记)
 * Context: 设备/工作流方向共用的代码编辑器
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import type { UseCodeMirrorResult } from './useCodeMirror'

interface CodeEditorProps {
  title: string
  editor: UseCodeMirrorResult
  language: string
}

// 代码编辑器容器:标题栏(文件名 + 语言 + dirty 标记)+ CodeMirror 挂载点
export function CodeEditor({ title, editor, language }: CodeEditorProps): React.JSX.Element {
  return (
    <div className="code-editor">
      <div className="code-editor__bar">
        <span className="code-editor__title">{title}</span>
        <span className="code-editor__lang">{language}</span>
        {editor.isDirty && <span className="code-editor__dirty">● 未保存</span>}
      </div>
      <div className="code-editor__surface" ref={editor.containerRef} />
    </div>
  )
}
