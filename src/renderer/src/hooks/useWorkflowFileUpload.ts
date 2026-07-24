/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-23
 * Prompt Summary: 工作流文件上传 hook(读取本地 JSON 文件并回调内容)
 * Context: 工作流工具栏"上传文件",仅支持 .json,加载到编辑器
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useRef } from 'react'

interface UploadedWorkflow {
  content: string
  fileName: string
}

interface UseWorkflowFileUploadParams {
  // 文件读取成功后回调(内容)
  onLoaded: (result: UploadedWorkflow) => void
  // 文件读取失败或类型不支持时回调
  onError?: (message: string) => void
}

interface UseWorkflowFileUploadResult {
  // 隐藏 file input 的 ref
  inputRef: React.RefObject<HTMLInputElement>
  // 触发文件选择框
  openFilePicker: () => void
  // file input 的 onChange 处理器
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

// 工作流文件上传:选择本地 JSON 文件 -> 读取文本 -> 回调
export function useWorkflowFileUpload({
  onLoaded,
  onError
}: UseWorkflowFileUploadParams): UseWorkflowFileUploadResult {
  const inputRef = useRef<HTMLInputElement>(null)

  const openFilePicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // 允许再次选择同一文件:清空 value
      event.target.value = ''
      if (!file) return

      if (!file.name.toLowerCase().endsWith('.json')) {
        onError?.('不支持的文件类型,请上传 .json 文件')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : ''
        onLoaded({ content, fileName: file.name })
      }
      reader.onerror = () => onError?.('文件读取失败')
      reader.readAsText(file)
    },
    [onLoaded, onError]
  )

  return { inputRef, openFilePicker, handleFileChange }
}
