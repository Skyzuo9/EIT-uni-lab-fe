export interface CapabilityStatus {
  available: boolean
  reason?: string
}

export function MaterialCapabilityNotice({
  title,
  status
}: {
  title: string
  status: CapabilityStatus
}): React.JSX.Element | null {
  if (status.available) return null
  return (
    <div className="material-capability" role="status">
      <strong>{title}</strong>
      <span>{status.reason ?? '当前 Profile 不支持此功能'}</span>
    </div>
  )
}
