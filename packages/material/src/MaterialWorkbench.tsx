/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-25
 * Prompt Summary: 物料方向面板(左 JSON 编辑 comprehensive_station + 右工作站可视化 + 本地文件打开/保存)
 * Context: 默认加载 comprehensive_station.json,支持打开本地 JSON 与 Cmd/Ctrl+S 保存
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useState } from 'react'
import { useResizableSplit } from '@unilab/app-shell'
import { CodeEditor, useCodeMirror } from '@unilab/code-editor'
import { StationView } from './StationView'
import { useParsedStationGraph } from './useParsedStationGraph'
import { useLocalJsonFile } from './useLocalJsonFile'
import { useSaveShortcut } from './useSaveShortcut'
import { stationGraphJson } from './stationGraph'

// 默认文件名
const DEFAULT_FILE_NAME = 'comprehensive_station.json'

// 物料方向:JSON 实时驱动工作站可视化,支持打开/保存本地文件、折叠代码
export function MaterialWorkbench(): React.JSX.Element {
  // 工具栏提示信息(错误/保存成功),纯本地 UI 状态
  const [notice, setNotice] = useState<{ type: 'error' | 'ok'; text: string } | null>(null)
  // 左侧代码编辑器是否折叠(纯本地 UI 开关)
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false)

  const { containerRef, leftRatio, isDragging, handlePointerDown } = useResizableSplit({
    initialRatio: 0.45,
    minRatio: 0.25,
    maxRatio: 0.7
  })

  const editor = useCodeMirror(stationGraphJson, 'json')
  const { graph, error } = useParsedStationGraph(editor.value)

  const { fileName, isSupported, open, save, saveAs } = useLocalJsonFile({
    defaultName: DEFAULT_FILE_NAME,
    onLoaded: (content, name) => {
      editor.replaceContent(content)
      setNotice({ type: 'ok', text: `已打开 ${name}` })
    },
    onError: (message) => setNotice({ type: 'error', text: message }),
    onSaved: (name) => {
      editor.markSaved()
      setNotice({ type: 'ok', text: `已保存 ${name}` })
    }
  })

  const handleSave = useCallback(() => {
    void save(editor.value)
  }, [save, editor.value])

  const handleSaveAs = useCallback(() => {
    void saveAs(editor.value)
  }, [saveAs, editor.value])

  useSaveShortcut(handleSave)

  return (
    <div className="workflow">
      <div className="workflow__toolbar">
        <span className="workflow__toolbar-label">物料</span>
        <span className="workflow__format">工作站拓扑 · {fileName}</span>

        <div className="workflow__toolbar-actions">
          {notice ? (
            <span
              className={notice.type === 'error' ? 'workflow__upload-error' : 'workflow__save-ok'}
            >
              {notice.text}
            </span>
          ) : null}
          <button
            type="button"
            className="workflow__upload"
            onClick={() => setIsEditorCollapsed((prev) => !prev)}
          >
            {isEditorCollapsed ? '显示代码' : '隐藏代码'}
          </button>
          <button
            type="button"
            className="workflow__upload"
            onClick={() => void open()}
            disabled={!isSupported}
          >
            打开本地 JSON
          </button>
          <button
            type="button"
            className="workflow__upload"
            onClick={handleSave}
            disabled={!isSupported}
            title="Cmd/Ctrl + S"
          >
            保存
          </button>
          <button
            type="button"
            className="workflow__upload"
            onClick={handleSaveAs}
            disabled={!isSupported}
          >
            另存为
          </button>
        </div>
      </div>

      <div ref={containerRef} className={`workbench${isDragging ? ' workbench--dragging' : ''}`}>
        {/* 折叠时用 display:none 隐藏而非卸载,保留 CodeMirror 实例与编辑内容 */}
        <div
          className="workbench__pane"
          style={{ flexBasis: `${leftRatio * 100}%`, display: isEditorCollapsed ? 'none' : undefined }}
        >
          <CodeEditor title={fileName} editor={editor} language="JSON" />
        </div>
        <div
          className="workbench__divider"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handlePointerDown}
          style={{ display: isEditorCollapsed ? 'none' : undefined }}
        >
          <span className="workbench__grip" />
        </div>
        <div
          className="workbench__pane"
          style={{ flexBasis: isEditorCollapsed ? '100%' : `${(1 - leftRatio) * 100}%` }}
        >
          <StationView graph={graph} error={error} />
        </div>
      </div>
    </div>
  )
}
