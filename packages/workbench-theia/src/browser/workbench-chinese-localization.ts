import type { TextReplacementContribution } from '@theia/core/lib/browser/preload/text-replacement-contribution'
import { injectable } from '@theia/core/shared/inversify'

const SIMPLIFIED_CHINESE_REPLACEMENTS: Readonly<Record<string, string>> = {
  File: '文件',
  Edit: '编辑',
  Selection: '选择',
  View: '视图',
  Go: '转到',
  Run: '运行',
  Terminal: '终端',
  Help: '帮助'
}

@injectable()
export class WorkbenchChineseTextReplacementContribution
implements TextReplacementContribution {
  getReplacement(locale: string): Record<string, string> {
    return locale.toLowerCase().startsWith('zh')
      ? { ...SIMPLIFIED_CHINESE_REPLACEMENTS }
      : {}
  }
}
