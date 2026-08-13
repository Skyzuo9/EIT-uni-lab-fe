/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-23
 * Prompt Summary: 工作流文件下载 hook(将文本内容导出为本地文件)
 * Context: 工作流工具栏"下载",导出当前编辑器 JSON 内容
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback } from 'react'

interface UseWorkflowDownloadResult {
  // 将文本内容以指定文件名下载为本地文件
  download: (content: string, fileName: string) => void
}

// 工作流文件下载:文本内容 -> Blob -> 触发浏览器下载
export function useWorkflowDownload(): UseWorkflowDownloadResult {
  const download = useCallback((content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [])

  return { download }
}
