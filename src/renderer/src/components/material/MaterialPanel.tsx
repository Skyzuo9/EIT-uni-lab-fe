/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-22
 * Prompt Summary: 物料方向面板(左 CodeMirror YAML 编辑 + 右复用现有 deck 可视化)
 * Context: 离线用示例 YAML 实时驱动 deck;后续接入在线 resources
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import DeckView from '../MaterialPanel'
import CodeEditor from '../editor/CodeEditor'
import { useCodeMirror } from '../../hooks/useCodeMirror'
import { useResizableSplit } from '../../hooks/useResizableSplit'
import { useParsedLiquidHandler } from '../../hooks/useParsedLiquidHandler'
import { liquidHandlerYaml } from '../../data/liquidHandler'

// 物料方向:YAML 实时驱动 deck 孔位可视化
export default function MaterialPanel(): JSX.Element {
  const { containerRef, leftRatio, isDragging, handlePointerDown } = useResizableSplit({
    initialRatio: 0.42,
    minRatio: 0.25,
    maxRatio: 0.7
  })

  const editor = useCodeMirror(liquidHandlerYaml, 'yaml')
  const { config, error } = useParsedLiquidHandler(editor.value)

  return (
    <div ref={containerRef} className={`workbench${isDragging ? ' workbench--dragging' : ''}`}>
      <div className="workbench__pane" style={{ flexBasis: `${leftRatio * 100}%` }}>
        <CodeEditor title="liquid_handler.yaml" editor={editor} language="YAML" />
      </div>
      <div
        className="workbench__divider"
        role="separator"
        aria-orientation="vertical"
        onPointerDown={handlePointerDown}
      >
        <span className="workbench__grip" />
      </div>
      <div className="workbench__pane" style={{ flexBasis: `${(1 - leftRatio) * 100}%` }}>
        <DeckView config={config} error={error} />
      </div>
    </div>
  )
}
