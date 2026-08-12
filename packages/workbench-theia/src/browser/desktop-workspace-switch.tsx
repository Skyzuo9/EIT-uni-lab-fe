import * as React from 'react'

import { desktopWorkspaceApi } from './desktop-workspace'

/** Desktop-only workspace selector shared by ready, starting and failed surfaces. */
export function DesktopWorkspaceSwitchButton(): React.JSX.Element | null {
  const api = React.useMemo(() => desktopWorkspaceApi(), [])
  const [available, setAvailable] = React.useState(false)
  const [switching, setSwitching] = React.useState(false)

  React.useEffect(() => {
    let active = true
    void api?.getSnapshot().then((snapshot) => {
      if (active) setAvailable(snapshot.phase !== 'unavailable')
    }).catch(() => undefined)
    return () => { active = false }
  }, [api])

  const selectWorkspace = React.useCallback(async () => {
    if (!api || switching) return
    setSwitching(true)
    try {
      await api.selectDirectory()
      setSwitching(false)
    } catch {
      setSwitching(false)
    }
  }, [api, switching])

  if (!available) return null
  return (
    <button
      type="button"
      disabled={switching}
      title="选择并打开 UniLab 工作区"
      onClick={() => { void selectWorkspace() }}
    >
      <span className="codicon codicon-folder-opened" aria-hidden="true" />
      {switching ? '正在切换…' : '选择工作区'}
    </button>
  )
}
