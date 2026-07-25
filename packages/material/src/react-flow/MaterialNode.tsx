import type { NodeProps } from 'reactflow'

import { useMaterialStore } from '../MaterialStoreProvider'
import type { MaterialFlowNodeData } from './projection'

export function MaterialNode({
  data,
  selected
}: NodeProps<MaterialFlowNodeData>): React.JSX.Element {
  const aggregate = useMaterialStore(
    (state) => state.aggregatesById[data.materialId]
  )

  if (!aggregate) {
    return <div className="material-flow-node is-missing">物料不存在</div>
  }

  const occupied = aggregate.sites.reduce(
    (total, site) => total + site.occupiedMaterialIds.length,
    0
  )

  return (
    <article
      className={`material-flow-node${selected ? ' is-selected' : ''}`}
    >
      <header>
        <span>{aggregate.material.code || 'Material'}</span>
        <small>r{aggregate.revision}</small>
      </header>
      <strong>{aggregate.material.name}</strong>
      <footer>
        <span>{placementLabel(aggregate.placement.kind)}</span>
        <span>
          {aggregate.sites.length
            ? `${occupied}/${aggregate.sites.length} Site`
            : '无 Site'}
        </span>
      </footer>
    </article>
  )
}

function placementLabel(kind: string): string {
  if (kind === 'world') return 'World'
  if (kind === 'parent') return 'Parent'
  if (kind === 'site') return 'Site'
  return '未放置'
}
