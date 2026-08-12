import {
  AbstractViewContribution,
  type FrontendApplication,
  type FrontendApplicationContribution
} from '@theia/core/lib/browser'
import { CommonMenus } from '@theia/core/lib/browser/common-menus'
import type {
  TabBarToolbarContribution,
  TabBarToolbarRegistry
} from '@theia/core/lib/browser/shell/tab-bar-toolbar/tab-bar-toolbar-registry'
import {
  MAIN_MENU_BAR,
  MenuModelRegistry,
  MutableCompoundMenuNode
} from '@theia/core/lib/common/menu'
import type { Command } from '@theia/core/lib/common/command'
import { inject, injectable } from '@theia/core/shared/inversify'
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands'

import { UniLabSettingsWidget } from './unilab-settings-widget'

export const OpenUniLabSettings: Command = {
  id: 'unilab.settings.open',
  label: '打开设置'
}

export const HIDDEN_ACTIVITY_WIDGET_IDS = [
  'search-view-container',
  'scm-view-container',
  'debug',
  'vsx-extensions-view-container',
  'test-view-container'
] as const

@injectable()
export class UniLabSettingsContribution
  extends AbstractViewContribution<UniLabSettingsWidget>
  implements FrontendApplicationContribution, TabBarToolbarContribution {
  @inject(MenuModelRegistry)
  protected readonly menus!: MenuModelRegistry

  constructor() {
    super({
      widgetId: UniLabSettingsWidget.ID,
      widgetName: UniLabSettingsWidget.LABEL,
      defaultWidgetOptions: { area: 'left', rank: 200 },
      toggleCommandId: OpenUniLabSettings.id
    })
  }

  /** 设置产品标题，避免浏览器标签继续显示框架默认名。 */
  onStart(_app: FrontendApplication): void {
    document.title = 'Unilab 调试工作台'
  }

  /** 精简活动栏与顶层菜单，并挂载独立设置模块。 */
  async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
    removeFileAndHelpMenus(this.menus)
    await Promise.all(
      HIDDEN_ACTIVITY_WIDGET_IDS.map((id) => app.shell.closeWidget(id))
    )
    await this.openView({ activate: false, reveal: false })
  }

  /** 在文件视图标题栏提供文件与文件夹选择入口。 */
  registerToolbarItems(registry: TabBarToolbarRegistry): void {
    const isFileView = (widget?: { id: string }): boolean =>
      Boolean(widget && [
        'explorer-view-container',
        'files',
        'navigator-container'
      ].includes(widget.id))
    registry.registerItem({
      id: 'unilab.workspace.select-file',
      command: WorkspaceCommands.OPEN_FILE.id,
      icon: 'codicon codicon-file',
      tooltip: '选择文件',
      group: 'navigation',
      priority: 20,
      isVisible: isFileView
    })
    registry.registerItem({
      id: 'unilab.workspace.select-folder',
      command: WorkspaceCommands.OPEN_FOLDER.id,
      icon: 'codicon codicon-folder-opened',
      tooltip: '选择文件夹',
      group: 'navigation',
      priority: 21,
      isVisible: isFileView
    })
  }
}

/** 从 Theia 主菜单模型中移除文档明确排除的文件与帮助入口。 */
export function removeFileAndHelpMenus(menus: MenuModelRegistry): void {
  const root = menus.getMenu(MAIN_MENU_BAR)
  if (!root || !MutableCompoundMenuNode.is(root)) return
  const hiddenIds = new Set([CommonMenus.FILE.at(-1), CommonMenus.HELP.at(-1)])
  for (const child of [...root.children]) {
    if (hiddenIds.has(child.id)) root.removeNode(child)
  }
}
