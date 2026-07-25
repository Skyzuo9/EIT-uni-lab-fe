/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-25
 * Prompt Summary: 本地 JSON 文件读写 hook(经 Electron IPC 打开/保存/另存为,记住原路径)
 * Context: 物料方向工具栏,支持打开本地 JSON 与 Cmd/Ctrl+S 保存回原文件
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useState } from 'react'

interface OpenedFile {
  path: string
  content: string
}

interface SavedFile {
  path: string
}

interface SaveFilePayload {
  path: string | null
  content: string
  defaultName?: string
}

// 桌面端(Electron preload)注入的本地文件 API 子集
interface DesktopFileApi {
  open: () => Promise<OpenedFile | null>
  save: (payload: SaveFilePayload) => Promise<SavedFile | null>
}

interface UseLocalJsonFileParams {
  // 默认另存为文件名
  defaultName: string
  // 文件读取成功后回调(内容, 文件名)
  onLoaded: (content: string, fileName: string) => void
  // 出错时回调
  onError?: (message: string) => void
  // 保存成功后回调(文件名)
  onSaved?: (fileName: string) => void
}

interface UseLocalJsonFileResult {
  // 当前关联的本地文件绝对路径(未打开/未另存为时为 null)
  currentPath: string | null
  // 当前文件名(取自 currentPath,否则用默认名)
  fileName: string
  // 是否处于 Electron 环境(支持原生文件读写)
  isSupported: boolean
  // 打开本地文件
  open: () => Promise<void>
  // 保存到当前文件;无当前文件则触发另存为
  save: (content: string) => Promise<void>
  // 另存为新文件
  saveAs: (content: string) => Promise<void>
}

// 读取桌面端注入的文件 API(浏览器环境返回 undefined)
function getDesktopFileApi(): DesktopFileApi | undefined {
  const injected = (globalThis as { api?: { file?: DesktopFileApi } }).api
  return injected?.file
}

// 从绝对路径中取文件名(兼容 Windows/Unix 分隔符)
function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

// 本地 JSON 文件读写:经 window.api.file(Electron IPC)打开/保存,并记住原始路径
export function useLocalJsonFile({
  defaultName,
  onLoaded,
  onError,
  onSaved
}: UseLocalJsonFileParams): UseLocalJsonFileResult {
  const [currentPath, setCurrentPath] = useState<string | null>(null)

  const fileApi = getDesktopFileApi()
  const isSupported = typeof fileApi?.open === 'function'

  const open = useCallback(async () => {
    if (!fileApi) {
      onError?.('当前环境不支持本地文件读写')
      return
    }
    try {
      const result = await fileApi.open()
      if (!result) return
      setCurrentPath(result.path)
      onLoaded(result.content, basename(result.path))
    } catch (error) {
      onError?.(error instanceof Error ? error.message : '打开文件失败')
    }
  }, [fileApi, onLoaded, onError])

  const saveAs = useCallback(
    async (content: string) => {
      if (!fileApi) {
        onError?.('当前环境不支持本地文件读写')
        return
      }
      try {
        const result = await fileApi.save({
          path: null,
          content,
          defaultName: currentPath ? basename(currentPath) : defaultName
        })
        if (!result) return
        setCurrentPath(result.path)
        onSaved?.(basename(result.path))
      } catch (error) {
        onError?.(error instanceof Error ? error.message : '保存文件失败')
      }
    },
    [fileApi, currentPath, defaultName, onError, onSaved]
  )

  const save = useCallback(
    async (content: string) => {
      if (!fileApi) {
        onError?.('当前环境不支持本地文件读写')
        return
      }
      if (!currentPath) {
        await saveAs(content)
        return
      }
      try {
        const result = await fileApi.save({ path: currentPath, content })
        if (result) onSaved?.(basename(result.path))
      } catch (error) {
        onError?.(error instanceof Error ? error.message : '保存文件失败')
      }
    },
    [fileApi, currentPath, saveAs, onError, onSaved]
  )

  return {
    currentPath,
    fileName: currentPath ? basename(currentPath) : defaultName,
    isSupported,
    open,
    save,
    saveAs
  }
}
