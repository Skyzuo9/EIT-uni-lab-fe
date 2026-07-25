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
    <div className="flex h-full w-full flex-col bg-[#282c34]">
      <div className="flex items-center gap-2.5 border-b border-[#1f2329] bg-[#21252b] px-3 py-1.5">
        <span className="font-mono text-xs text-[#abb2bf]">{title}</span>
        <span className="rounded-[10px] bg-[rgba(97,175,239,0.15)] px-2 py-px text-[10px] text-[#61afef]">
          {language}
        </span>
        {editor.isDirty && (
          <span className="ml-auto text-[11px] text-[#e5c07b]">● 未保存</span>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full"
        ref={editor.containerRef}
      />
    </div>
  )
}
