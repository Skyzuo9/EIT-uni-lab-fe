interface WorkflowTraceStateProps {
  title: string
  detail: string
  tone?: 'neutral' | 'error'
  actionLabel?: string
  onAction?: () => void
}

/** 渲染跟踪数据的加载、空态或错误状态。 */
export function WorkflowTraceState({
  title,
  detail,
  tone = 'neutral',
  actionLabel,
  onAction
}: WorkflowTraceStateProps): React.JSX.Element {
  return (
    <div
      className="workflow-runtime__trace-state"
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span aria-hidden="true">{tone === 'error' ? '!' : '···'}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  )
}

/** 渲染跟踪关系图标。 */
export function WorkflowTraceGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="4" cy="5" r="1.75" />
      <circle cx="15.5" cy="10" r="1.75" />
      <circle cx="7" cy="15" r="1.75" />
      <path d="M5.6 5.8 13.8 9M14 11.2 8.5 14.3M5.1 6.6l1.4 6.7" />
    </svg>
  )
}

/** 渲染刷新图标。 */
export function WorkflowTraceRefreshGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.8 7.2A6.2 6.2 0 1 0 16 12" />
      <path d="M12.7 7.2h3.1V4.1" />
    </svg>
  )
}

/** 渲染关闭图标。 */
export function WorkflowTraceCloseGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  )
}
