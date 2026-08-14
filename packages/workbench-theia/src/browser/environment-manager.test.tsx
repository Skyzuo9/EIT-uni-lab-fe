import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  describeEnvironmentOperationError,
  ExternalDevicesOnlyControl,
  RuntimeModeControl
} from './environment-manager'

describe('ExternalDevicesOnlyControl', () => {
  it('renders the external-only launch option as a checked checkbox by default', () => {
    const markup = renderToStaticMarkup(
      <ExternalDevicesOnlyControl
        checked
        disabled={false}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('checked=""')
    expect(markup).toContain('仅加载外部设备包')
    expect(markup).toContain('同时加载 OS 内置 Registry')
  })
})

describe('describeEnvironmentOperationError', () => {
  it('explains why reset-and-publish is unavailable in Backend mode', () => {
    expect(describeEnvironmentOperationError(
      'reset-and-publish-release',
      'WorkspaceRelease 只能从 Local Authority 构建'
    )).toEqual({
      title: '当前模式无法清空并发布',
      message: '当前工作区由 Backend 管理，不能在这里构建发布包。' +
        '请切换到 Local 模式后，再执行“清空并发布”。' +
        '目标 Backend 的数据尚未被清除。'
    })
  })

  it('keeps unexpected errors available for diagnosis', () => {
    expect(describeEnvironmentOperationError('restart-os', '端口被占用')).toEqual({
      title: '环境操作失败',
      message: '端口被占用'
    })
  })
})

describe('RuntimeModeControl', () => {
  it.each([
    ['normal', '正常运行', 'Dry-run'],
    ['dry-run', 'Dry-run', '正常运行']
  ] as const)('exposes %s as the unambiguous selected mode', (
    mode,
    selectedLabel,
    otherLabel
  ) => {
    const markup = renderToStaticMarkup(
      <RuntimeModeControl
        mode={mode}
        disabled={false}
        onSetRuntimeMode={vi.fn()}
      />
    )

    expect(markup).toContain(
      `aria-label="${selectedLabel}（当前）"`
    )
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('codicon-check')
    expect(markup).toContain(`aria-label="${otherLabel}"`)
    expect(markup).toContain('aria-pressed="false"')
  })
})
