import {
  TextReplacementContribution
} from '@theia/core/lib/browser/preload/text-replacement-contribution'
import { ContainerModule, injectable } from '@theia/core/shared/inversify'

@injectable()
class UniLabChineseTextReplacement implements TextReplacementContribution {
  /** 返回工作台外壳使用的中文界面文案。 */
  getReplacement(_locale: string): Record<string, string> {
    return {
      Edit: '编辑',
      Selection: '选择',
      View: '视图',
      Go: '转到',
      Run: '运行',
      Terminal: '终端',
      Explorer: '文件',
      Settings: '设置',
      Preferences: '偏好设置',
      Undo: '撤销',
      Redo: '重做',
      Cut: '剪切',
      Copy: '复制',
      Paste: '粘贴',
      Find: '查找',
      Replace: '替换',
      'Command Palette...': '命令面板…',
      Appearance: '外观',
      'Editor Layout': '编辑器布局',
      'Open View...': '打开视图…',
      'Toggle Primary Side Bar': '切换主侧栏',
      'Toggle Secondary Side Bar': '切换辅助侧栏',
      'Toggle Panel': '切换面板',
      'Toggle Full Screen': '切换全屏',
      'Open File...': '打开文件…',
      'Open Folder...': '打开文件夹…',
      'New File...': '新建文件…',
      'New Folder...': '新建文件夹…',
      'Save': '保存',
      'Save As...': '另存为…',
      'Save All': '全部保存',
      'Close Editor': '关闭编辑器',
      'Close All Editors': '关闭全部编辑器',
      'New Terminal': '新建终端',
      'Split Terminal': '拆分终端',
      'Run Task...': '运行任务…',
      'Run Selected Text In Active Terminal': '在当前终端运行所选文本'
    }
  }
}

export default new ContainerModule((bind) => {
  bind(TextReplacementContribution)
    .to(UniLabChineseTextReplacement)
    .inSingletonScope()
})
