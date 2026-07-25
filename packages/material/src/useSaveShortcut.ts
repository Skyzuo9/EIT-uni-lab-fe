/** [AI] Model: Claude Opus 4.8 | 2026-07-25 | 监听 Cmd+S / Ctrl+S 触发保存回调 */
import { useEffect } from 'react'

// 绑定全局 Cmd+S / Ctrl+S 快捷键,触发保存(阻止浏览器默认保存行为)
export function useSaveShortcut(onSave: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSave])
}
