import { useMaterialStore } from './MaterialStoreProvider'
import type { CapabilityStatus } from './MaterialCapabilityNotice'
import type { MaterialId } from './types'

export function MaterialInspector({
  materialId,
  updateStatus
}: {
  materialId: MaterialId | null
  updateStatus: CapabilityStatus
}): React.JSX.Element {
  const aggregate = useMaterialStore((state) =>
    materialId ? state.aggregatesById[materialId] : undefined
  )

  return (
    <aside className="material-inspector">
      <header>
        <span>Inspector</span>
        <h2>物料属性</h2>
      </header>
      {!aggregate ? (
        <p>选择 2D 或 3D 中的物料查看详情</p>
      ) : (
        <div className="material-inspector__content">
          <dl>
            <dt>名称</dt>
            <dd>{aggregate.material.name}</dd>
            <dt>代码</dt>
            <dd>{aggregate.material.code || '—'}</dd>
            <dt>Template</dt>
            <dd>{aggregate.material.sourceTemplateId}</dd>
            <dt>Placement</dt>
            <dd>{aggregate.placement.kind}</dd>
            <dt>Revision</dt>
            <dd>{aggregate.revision}</dd>
          </dl>
          <h3>Config</h3>
          <pre>{JSON.stringify(aggregate.material.config, null, 2)}</pre>
          {!updateStatus.available ? (
            <small>{updateStatus.reason}</small>
          ) : null}
        </div>
      )}
    </aside>
  )
}
