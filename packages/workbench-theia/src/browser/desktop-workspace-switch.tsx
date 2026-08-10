import * as React from 'react'

import { desktopWorkspaceApi } from './desktop-workspace'

/** Desktop-only escape hatch shared by ready, starting and failed surfaces. */
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

  const switchWorkspace = React.useCallback(async () => {
    if (!api || switching) return
    setSwitching(true)
    try {
      const result = await api.switchToWelcome()
      if (!result.switched) setSwitching(false)
    } catch {
      setSwitching(false)
    }
  }, [api, switching])

  if (!available) return null
  return (
    <button
      type="button"
      disabled={switching}
      title="返回欢迎页并停止当前工作区服务"
      onClick={() => { void switchWorkspace() }}
    >
      {switching ? '正在切换…' : '切换工作区'}
    </button>
  )
}
