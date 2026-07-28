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
        <span>属性检查</span>
        <h2>物料属性</h2>
      </header>
      {!aggregate ? (
        <p className="material-inspector__empty">
          <span className="material-inspector__empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="m12 3 7.5 4.25v8.5L12 20l-7.5-4.25v-8.5L12 3Z" />
              <path d="m4.8 7.5 7.2 4 7.2-4M12 11.5v8" />
            </svg>
          </span>
          <strong>尚未选择物料</strong>
          <span>从 2D、2.5D 或 3D 视图中选择物料查看属性。</span>
        </p>
      ) : (
        <div className="material-inspector__content">
          <dl>
            <dt>名称</dt>
            <dd>{aggregate.material.name}</dd>
            <dt>代码</dt>
            <dd>{aggregate.material.code || '—'}</dd>
            <dt>模板</dt>
            <dd>{aggregate.material.sourceTemplateId}</dd>
            <dt>放置方式</dt>
            <dd>{placementLabel(aggregate.placement.kind)}</dd>
            <dt>修订版本</dt>
            <dd>{aggregate.revision}</dd>
          </dl>
          <h3>配置</h3>
          <pre>{JSON.stringify(aggregate.material.config, null, 2)}</pre>
          {!updateStatus.available ? (
            <small>{updateStatus.reason}</small>
          ) : null}
        </div>
      )}
    </aside>
  )
}

function placementLabel(kind: string): string {
  if (kind === 'world') return '全局坐标'
  if (kind === 'parent') return '父级对象'
  if (kind === 'site') return '安装位'
  return kind
}
