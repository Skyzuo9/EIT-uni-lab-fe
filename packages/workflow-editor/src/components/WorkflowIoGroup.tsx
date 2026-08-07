interface WorkflowIoGroupProps {
  id: 'input' | 'output'
  title: string
  active: boolean
  children: React.ReactNode
}

/**
 * 提供工作流输入或输出参数页签对应的可访问面板容器。
 *
 * @param props 面板身份、标题、激活状态与字段内容。
 * @returns 带页签关联属性的参数分组面板。
 */
export function WorkflowIoGroup({
  id,
  title,
  active,
  children
}: WorkflowIoGroupProps): React.JSX.Element {
  return (
    <section
      id={`workflow-io-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`workflow-io-tab-${id}`}
      hidden={!active}
    >
      <h3>{title}</h3>
      {children}
    </section>
  )
}
