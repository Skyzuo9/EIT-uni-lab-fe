import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { RobotWorkstation } from './RobotWorkstation'

describe('RobotWorkstation', () => {
  /** 证明 Workbench 可以注入真实设备动作面板，且组件不再创建二级导航。 */
  it('renders the host-provided action debug surface without nested tabs', () => {
    const markup = renderToStaticMarkup(
      <RobotWorkstation
        module="debug"
        actionContent={<div data-testid="real-device-actions">真实动作目录</div>}
      />
    )

    expect(markup).toContain('真实动作目录')
    expect(markup).toContain('data-testid="real-device-actions"')
    expect(markup).not.toContain('role="tablist"')
    expect(markup).not.toContain('本地演示')
  })

  /** 证明点位接口缺失时隐藏文件夹具和所有本地写操作。 */
  it('fails closed when the backend has no point directory API', () => {
    const markup = renderToStaticMarkup(
      <RobotWorkstation
        module="points"
        pointStatus={{ phase: 'unavailable', message: '后端未公开点位目录接口' }}
      />
    )

    expect(markup).toContain('后端未公开点位目录接口')
    expect(markup).not.toContain('保存修改')
    expect(markup).not.toContain('导入文件')
    expect(markup).not.toContain('ST01')
  })

  /** 证明实验台只展示公共物料图投影且不伪造历史。 */
  it('renders the real bench projection without fixture history', () => {
    const markup = renderToStaticMarkup(
      <RobotWorkstation
        module="bench"
        benchStatus={{ phase: 'ready', message: '已同步' }}
        benchSnapshot={{
          sites: [{
            id: 'site-real',
            name: '真实库位',
            device: '实验台 A',
            position: '10 mm, 20 mm, 30 mm',
            materialType: 'reagent',
            materialName: null,
            workflowLabel: null,
            status: 'empty',
            x: 10,
            y: 20,
            width: 30
          }],
          materials: [],
          history: []
        }}
      />
    )

    expect(markup).toContain('真实库位')
    expect(markup).toContain('公共物料图')
    expect(markup).not.toContain('本地演示')
  })

  /** 证明试剂接口没有提供的预留量保持未知而不是前端补零。 */
  it('preserves missing reagent quantities as unknown', () => {
    const markup = renderToStaticMarkup(
      <RobotWorkstation
        module="reagents"
        reagentStatus={{ phase: 'ready', message: '已同步' }}
        reagentItems={[{
          id: 'reagent-real',
          name: '真实乙醇',
          totalQuantity: 50,
          unit: 'mL',
          status: 'available'
        }]}
      />
    )

    expect(markup).toContain('真实乙醇')
    expect(markup).toContain('50 mL')
    expect(markup).toContain('— / —')
    expect(markup).not.toContain('本地演示')
  })

  /** 证明只有注入真实 Backend 管理端口时才展示新增、编辑和历史入口。 */
  it('shows reagent CRUD only with the Backend management port', () => {
    const markup = renderToStaticMarkup(
      <RobotWorkstation
        module="reagents"
        reagentStatus={{ phase: 'ready', message: '已同步' }}
        reagentItems={[{
          id: 'reagent-real', materialId: 'material-1', reagentInfoId: 'info-1',
          name: '乙醇', totalQuantity: 50, unit: 'mL', revision: 2,
          updatedAt: '2026-08-13T00:00:00Z', status: 'available'
        }]}
        reagentManagement={{
          containers: [{ id: 'material-2', name: '空瓶', templateId: 'bottle' }],
          containerStatus: { phase: 'ready', message: '已同步' },
          create: async () => undefined,
          update: async () => undefined,
          delete: async () => undefined,
          readHistory: async () => []
        }}
      />
    )

    expect(markup).toContain('新增试剂')
    expect(markup).toContain('编辑 乙醇')
    expect(markup).toContain('查看 乙醇 历史')
    expect(markup).toContain('expected_revision')
  })
})
