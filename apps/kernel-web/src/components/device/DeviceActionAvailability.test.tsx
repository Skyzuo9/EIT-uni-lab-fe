import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DeviceAction } from '@unilab/services'

import {
  DeviceActionAvailability,
  DeviceLockControl,
  UnlockConfirmationDialog
} from './DevicePanel'

describe('device action Runtime availability', () => {
  it('keeps direct execution unavailable until an applied Workflow owns the Task', () => {
    const markup = renderToStaticMarkup(<DeviceActionAvailability />)

    expect(markup).toContain('请在工作流中运行')
    expect(markup).toContain('disabled')
  })
})

describe('device Action lock controls', () => {
  const busyAction: DeviceAction = {
    actionName: 'move',
    actionRef: 'robot.move',
    displayName: '移动',
    label: '移动',
    typeName: 'RobotMove',
    isBusy: true,
    currentJobId: 'job-active-1234567890',
    schema: null,
    inputSchema: {},
    outputSchema: {}
  }

  it('shows the existing holder and a discoverable manual unlock action', () => {
    const markup = renderToStaticMarkup(
      <DeviceLockControl
        action={busyAction}
        canForceUnlock
        operation={null}
        onRequestUnlock={() => {}}
      />
    )

    expect(markup).toContain('此动作被设备锁占用')
    expect(markup).toContain('手动解锁')
    expect(markup).toContain('job-acti')
  })

  it('fails closed when Edge reports busy without a holder token', () => {
    const markup = renderToStaticMarkup(
      <DeviceLockControl
        action={{ ...busyAction, currentJobId: null }}
        canForceUnlock
        operation={null}
        onRequestUnlock={() => {}}
      />
    )

    expect(markup).toContain('锁持有者信息缺失')
    expect(markup).not.toContain('手动解锁</button>')
  })

  it('keeps manual unlock unavailable for backends without the capability', () => {
    const markup = renderToStaticMarkup(
      <DeviceLockControl
        action={busyAction}
        canForceUnlock={false}
        operation={null}
        onRequestUnlock={() => {}}
      />
    )

    expect(markup).toContain('此动作被设备锁占用')
    expect(markup).not.toContain('手动解锁</button>')
  })

  it('disables duplicate requests and keeps an actionable error visible', () => {
    const pendingMarkup = renderToStaticMarkup(
      <DeviceLockControl
        action={busyAction}
        canForceUnlock
        operation={{
          actionRef: 'robot.move',
          state: 'pending',
          message: '正在请求 OS 取消当前动作并释放锁…'
        }}
        onRequestUnlock={() => {}}
      />
    )
    const errorMarkup = renderToStaticMarkup(
      <DeviceLockControl
        action={busyAction}
        canForceUnlock
        operation={{
          actionRef: 'robot.move',
          state: 'error',
          message: '设备 Action 锁持有者已变化，请刷新后重新确认'
        }}
        onRequestUnlock={() => {}}
      />
    )

    expect(pendingMarkup).toContain('正在解锁…')
    expect(pendingMarkup).toContain('disabled')
    expect(errorMarkup).toContain('设备 Action 锁持有者已变化')
    expect(errorMarkup).toContain('role="alert"')
  })

  it('shows an OS-confirmed result only after the refreshed Action is free', () => {
    const markup = renderToStaticMarkup(
      <DeviceLockControl
        action={{ ...busyAction, isBusy: false, currentJobId: null }}
        canForceUnlock
        operation={{
          actionRef: 'robot.move',
          state: 'success',
          message: 'OS 已释放 1 个关联 Job，正在复核最新目录状态。'
        }}
        onRequestUnlock={() => {}}
      />
    )

    expect(markup).toContain('动作锁已释放')
    expect(markup).toContain('OS 已释放 1 个关联 Job')
  })

  it('requires explicit physical-safety confirmation in the dialog', () => {
    const markup = renderToStaticMarkup(
      <UnlockConfirmationDialog
        intent={{
          deviceId: 'robot',
          deviceName: '机械臂',
          actionName: 'move',
          actionRef: 'robot.move',
          actionLabel: '移动',
          expectedJobId: 'job-active-1234567890'
        }}
        operation={null}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(markup).toContain('我已确认设备处于安全状态')
    expect(markup).toContain('确认并解锁')
    expect(markup).toContain('disabled')
  })
})
