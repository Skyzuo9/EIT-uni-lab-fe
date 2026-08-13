export function CanvasLegend(): React.JSX.Element {
  return (
    <div
      className="material-oblique-canvas__legend"
      aria-label="2.5D 图例与操作说明"
    >
      <div>
        <span className="material-oblique-legend-key is-selected">
          <i aria-hidden="true" />
          已选
        </span>
        <span className="material-oblique-legend-key is-occupied">
          <i aria-hidden="true" />
          已占用
        </span>
      </div>
      <span>
        滚轮缩放 · 拖动旋转 · Shift + 拖动平移 · Ctrl / ⌘ 多选 · Esc 清除
      </span>
    </div>
  )
}
