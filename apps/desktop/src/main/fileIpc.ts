import { basename } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { dialog, type BrowserWindow, type IpcMain } from 'electron'

interface SaveFilePayload {
  path: string | null
  content: string
  defaultName?: string
}

interface SaveBinaryFilePayload {
  content: Uint8Array
  defaultName?: string
}

interface OpenFilePayload {
  accept?: 'json' | 'python'
}

interface FileIpcOptions {
  ipcMain: IpcMain
  getMainWindow: () => BrowserWindow | null
}

/** 注册受系统对话框约束的文本打开、文本保存和二进制导出 IPC。 */
export function registerFileIpc({
  ipcMain,
  getMainWindow
}: FileIpcOptions): void {
  ipcMain.handle('file:open', async (_event, payload?: OpenFilePayload) => {
    const isPython = payload?.accept === 'python'
    const options: Electron.OpenDialogOptions = {
      title: isPython ? '打开 Python 文件' : '打开 JSON 文件',
      filters: isPython
        ? [{ name: 'Python', extensions: ['py'] }]
        : [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    }
    const window = getMainWindow()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    return { path: filePath, content: await readFile(filePath, 'utf-8') }
  })

  ipcMain.handle('file:save', async (_event, payload: SaveFilePayload) => {
    let filePath = payload.path
    if (!filePath) {
      const options: Electron.SaveDialogOptions = {
        title: '保存 JSON 文件',
        defaultPath: payload.defaultName || 'station.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }
      const window = getMainWindow()
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      filePath = result.filePath
    }
    await writeFile(filePath, payload.content, 'utf-8')
    return { path: filePath }
  })

  ipcMain.handle(
    'file:saveBinary',
    async (event, payload: SaveBinaryFilePayload) => {
      const window = getMainWindow()
      if (event.sender.id !== window?.webContents.id) {
        throw new Error('二进制保存调用方不是主渲染进程。')
      }
      if (
        !payload ||
        !(payload.content instanceof Uint8Array) ||
        payload.content.byteLength === 0 ||
        payload.content.byteLength > 10 * 1024 * 1024
      ) {
        throw new Error('二进制文件无效或超过 10 MiB。')
      }
      const options: Electron.SaveDialogOptions = {
        title: '保存卡片开发包',
        defaultPath: basename(payload.defaultName || 'unilab-card-kit.zip'),
        filters: [{ name: '卡片开发包', extensions: ['zip'] }]
      }
      const result = await dialog.showSaveDialog(window, options)
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, payload.content)
      return { path: result.filePath }
    }
  )
}
