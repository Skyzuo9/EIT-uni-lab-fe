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
