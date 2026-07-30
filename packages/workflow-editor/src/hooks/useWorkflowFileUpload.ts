/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-23
 * Prompt Summary: 工作流文件上传 hook(读取本地 JSON/Python 文件并回调内容)
 * Context: 工作流工具栏"上传文件",支持 .json/.py,加载到编辑器
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useCallback, useRef } from 'react'

// 导入的文件类型:JSON 标准工作流 或 Python 编写脚本
export type WorkflowImportKind = 'json' | 'python'

interface UploadedWorkflow {
  content: string
  fileName: string
  writeBack?: (content: string) => Promise<void>
}

interface UseWorkflowFileUploadParams {
  // 文件读取成功后回调(内容)
  onLoaded: (result: UploadedWorkflow) => void
  // 文件读取失败或类型不支持时回调
  onError?: (message: string) => void
}

interface UseWorkflowFileUploadResult {
  // 隐藏 file input 的 ref
  inputRef: React.RefObject<HTMLInputElement | null>
  // 触发文件选择框(kind 决定过滤的文件类型,默认 JSON)
  openFilePicker: (kind?: WorkflowImportKind) => void
  // file input 的 onChange 处理器
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

// 单一类型的导入规格:对话框过滤 / 校验扩展名 / input accept
interface ImportSpec {
  kind: WorkflowImportKind
  extensions: string[]
  inputAccept: string
  description: string
  pickerAccept: Record<string, string[]>
}

function importSpec(kind: WorkflowImportKind): ImportSpec {
  if (kind === 'python') {
    return {
      kind,
      extensions: ['.py'],
      inputAccept: '.py,text/x-python',
      description: '工作流 Python',
      pickerAccept: { 'text/x-python': ['.py'] }
    }
  }
  return {
    kind,
    extensions: ['.json'],
    inputAccept: '.json,application/json',
    description: '工作流 JSON',
    pickerAccept: { 'application/json': ['.json'] }
  }
}

interface DesktopFileApi {
  open: (payload?: { accept?: WorkflowImportKind }) => Promise<{
    path: string
    content: string
  } | null>
  save: (payload: {
    path: string | null
    content: string
    defaultName?: string
  }) => Promise<{ path: string } | null>
}

interface WorkflowFileWritable {
  write: (content: string) => Promise<void>
  close: () => Promise<void>
}

interface WorkflowFileHandle {
  name: string
  getFile: () => Promise<File>
  createWritable: () => Promise<WorkflowFileWritable>
}

interface WorkflowFilePickerWindow {
  api?: {
    file?: DesktopFileApi
  }
  showOpenFilePicker?: (options: {
    multiple: boolean
    types: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<WorkflowFileHandle[]>
}

// 工作流文件上传:选择本地 JSON/Python 文件 -> 读取文本 -> 回调
export function useWorkflowFileUpload({
  onLoaded,
  onError
}: UseWorkflowFileUploadParams): UseWorkflowFileUploadResult {
  const inputRef = useRef<HTMLInputElement>(null)
  // 记录最近一次点击选择的类型,供 fallback input 的 onChange 校验使用
  const requestedSpecRef = useRef<ImportSpec | null>(null)

  const openFilePicker = useCallback(
    (kind: WorkflowImportKind = 'json') => {
      const spec = importSpec(kind)
      requestedSpecRef.current = spec
      void (async () => {
        const fileWindow = window as unknown as WorkflowFilePickerWindow
        const desktopFile = fileWindow.api?.file
        try {
          if (desktopFile) {
            const opened = await desktopFile.open({ accept: spec.kind })
            if (!opened) return
            const fileName = workflowFileName(opened.path)
            if (!hasAllowedExtension(fileName, spec.extensions)) {
              onError?.(unsupportedMessage(spec))
              return
            }
            onLoaded({
              content: opened.content,
              fileName,
              writeBack: async (content) => {
                const saved = await desktopFile.save({
                  path: opened.path,
                  content
                })
                if (!saved) throw new Error('原文件写入已取消')
              }
            })
            return
          }

          if (fileWindow.showOpenFilePicker) {
            const [handle] = await fileWindow.showOpenFilePicker({
              multiple: false,
              types: [
                {
                  description: spec.description,
                  accept: spec.pickerAccept
                }
              ]
            })
            if (!handle) return
            const file = await handle.getFile()
            if (!hasAllowedExtension(file.name, spec.extensions)) {
              onError?.(unsupportedMessage(spec))
              return
            }
            onLoaded({
              content: await file.text(),
              fileName: file.name,
              writeBack: async (content) => {
                const writable = await handle.createWritable()
                await writable.write(content)
                await writable.close()
              }
            })
            return
          }

          if (inputRef.current) inputRef.current.accept = spec.inputAccept
          inputRef.current?.click()
        } catch (error) {
          if (isFilePickerCancellation(error)) return
          onError?.(
            error instanceof Error
              ? `文件读取失败：${error.message}`
              : '文件读取失败'
          )
        }
      })()
    },
    [onLoaded, onError]
  )

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // 允许再次选择同一文件:清空 value
      event.target.value = ''
      if (!file) return

      const spec = requestedSpecRef.current
      const allowedExtensions = spec
        ? spec.extensions
        : [...SUPPORTED_WORKFLOW_EXTENSIONS]
      if (!hasAllowedExtension(file.name, allowedExtensions)) {
        onError?.(
          spec
            ? unsupportedMessage(spec)
            : '不支持的文件类型，请上传 .json 或 .py 文件'
        )
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

const SUPPORTED_WORKFLOW_EXTENSIONS = ['.json', '.py'] as const

function hasAllowedExtension(fileName: string, extensions: string[]): boolean {
  const lowerName = fileName.toLowerCase()
  return extensions.some((extension) => lowerName.endsWith(extension))
}

function unsupportedMessage(spec: ImportSpec): string {
  return `不支持的文件类型，请上传 ${spec.extensions.join(' 或 ')} 文件`
}

function workflowFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || 'workflow.json'
}

function isFilePickerCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
