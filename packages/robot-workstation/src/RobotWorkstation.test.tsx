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

    expect(markup).toContain('登记试剂')
    expect(markup).toContain('编辑 乙醇')
    expect(markup).toContain('查看 乙醇 历史')
    expect(markup).toContain('expected_revision')
  })

  /** 证明真实试剂管理恢复附件中的台账/试剂库分层，并展示权威基础化学信息。 */
  it('renders separate ledger and authoritative reagent library views', () => {
    const markup = renderToStaticMarkup(
      <RobotWorkstation
        module="reagents"
        reagentStatus={{ phase: 'ready', message: '已同步' }}
        reagentItems={[{
          id: 'reagent-real', materialId: 'material-1', reagentInfoId: 'info-1',
          name: '乙醇', totalQuantity: 50, unit: 'mL', densityGPerMl: 0.789,
          siteLabel: '乙醇瓶', status: 'available'
        }]}
        reagentInfoStatus={{ phase: 'ready', message: '已同步' }}
        reagentInfos={[{
          id: 'info-1', name: '乙醇', nameEn: 'Ethanol', aliases: ['酒精'],
          cas: '64-17-5', molecularFormula: 'C2H6O', smiles: 'CCO',
          molecularWeight: 46.07, densityGPerMl: 0.789,
          physicalState: 'liquid', metadata: { storage: '阴凉通风' }
        }]}
      />
    )

    expect(markup).toContain('试剂台账')
    expect(markup).toContain('试剂库')
    expect(markup).toContain('库存实例')
    expect(markup).toContain('试剂基础信息')
    expect(markup).toContain('64-17-5')
    expect(markup).toContain('C2H6O')
    expect(markup).toContain('46.07 g/mol')
    expect(markup).toContain('阴凉通风')
    expect(markup).not.toContain('新增试剂基础信息')
  })
})
