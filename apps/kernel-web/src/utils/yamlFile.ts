/** [AI] Model: Claude Opus 4.8 | 2026-07-21 | YAML 文件下载/读取工具 */

// 将文本内容作为 .yaml 文件触发浏览器下载
export function downloadYaml(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

// 读取用户选择的文件为文本
export async function readTextFile(file: File): Promise<string> {
  return file.text()
}
