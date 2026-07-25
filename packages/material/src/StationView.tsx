/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-25
 * Prompt Summary: 工作站设备拓扑可视化(层级树 + 物料/试剂 + 设备分组 + 节点详情)
 * Context: 物料方向右侧面板,由 station JSON 实时驱动
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import { useMemo, useState } from 'react'
import type { StationGraph, StationNode } from './stationGraph'

interface StationViewProps {
  graph: StationGraph
  error?: string | null
}

// 各设备类别的中文名与配色
const CLASS_META: Record<string, { label: string; color: string }> = {
  workstation: { label: '工作站', color: '#7048e8' },
  container: { label: '容器/试剂', color: '#12b886' },
  virtual_multiway_valve: { label: '多通阀', color: '#4dabf7' },
  virtual_transfer_pump: { label: '转移泵', color: '#228be6' },
  virtual_centrifuge: { label: '离心机', color: '#f76707' },
  virtual_rotavap: { label: '旋蒸仪', color: '#e8590c' },
  virtual_heatchill: { label: '加热制冷', color: '#f03e3e' },
  virtual_stirrer: { label: '搅拌器', color: '#d6336c' },
  virtual_solenoid_valve: { label: '电磁阀', color: '#15aabf' },
  virtual_vacuum_pump: { label: '真空泵', color: '#5c7cfa' },
  virtual_gas_source: { label: '气源', color: '#20c997' },
  virtual_filter: { label: '过滤器', color: '#82c91e' },
  virtual_column: { label: '色谱柱', color: '#74b816' },
  virtual_separator: { label: '分离器', color: '#66a80f' },
  virtual_solid_dispenser: { label: '固体加样器', color: '#f59f00' }
}

// 工作站设备拓扑可视化:由解析后的 graph 驱动
export function StationView({ graph, error }: StationViewProps): React.JSX.Element {
  // 纯 UI 局部状态:当前选中的节点 id
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const nodeMap = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes])
  const roots = useMemo(() => graph.nodes.filter((n) => !n.parent), [graph.nodes])
  const groups = useMemo(() => buildGroups(graph.nodes), [graph.nodes])
  const materials = useMemo(() => graph.nodes.filter((n) => n.class === 'container'), [graph.nodes])

  const selected = selectedId ? nodeMap.get(selectedId) ?? null : null
  const stationName = roots[0]?.name ?? '工作站'

  return (
    <section className="panel panel--material">
      <header className="panel__header">
        <span className="panel__dot panel__dot--material" />
        <span className="panel__title">工作站布局</span>
        <span className="panel__badge panel__badge--device">{stationName}</span>
        <span className="panel__meta">
          {graph.nodes.length} 节点 · {graph.links.length} 连接
        </span>
      </header>

      {error ? <div className="material__error">JSON 解析错误，展示上一次有效布局：{error}</div> : null}

      <div className="station">
        <div className="station__main">
          <div className="station__block">
            <h4 className="station__block-title">层级结构</h4>
            {roots.length > 0 ? (
              <div className="station-tree">
                {roots.map((node) => (
                  <StationTreeNode
                    key={node.id}
                    node={node}
                    nodeMap={nodeMap}
                    depth={0}
                    visited={new Set()}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            ) : (
              <p className="material__hint">JSON 中未找到根节点</p>
            )}
          </div>

          <div className="station__block">
            <h4 className="station__block-title">物料 / 试剂（{materials.length}）</h4>
            {materials.length > 0 ? (
              <ul className="mat-list">
                {materials.map((node) => (
                  <MaterialRow
                    key={node.id}
                    node={node}
                    selected={node.id === selectedId}
                    onSelect={setSelectedId}
                  />
                ))}
              </ul>
            ) : (
              <p className="material__hint">未定义容器类物料</p>
            )}
          </div>
        </div>

        <aside className="station__side">
          <div className="station__block">
            <h4 className="station__block-title">设备分组</h4>
            <div className="station-groups">
              {groups.map((group) => (
                <div className="station-group" key={group.className}>
                  <span className="station-group__head">
                    <span className="station-group__dot" style={{ backgroundColor: group.color }} />
                    {group.label}
                    <span className="station-group__count">{group.nodes.length}</span>
                  </span>
                  <div className="station-group__chips">
                    {group.nodes.map((node) => (
                      <button
                        type="button"
                        key={node.id}
                        className={`station-chip${node.id === selectedId ? ' is-active' : ''}`}
                        style={{ borderColor: group.color }}
                        onClick={() => setSelectedId(node.id)}
                        title={node.id}
                      >
                        {node.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="station__block">
            <h4 className="station__block-title">节点详情</h4>
            {selected ? (
              <NodeDetail node={selected} graph={graph} />
            ) : (
              <p className="material__hint">点击任意设备或物料查看详情</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

interface StationTreeNodeProps {
  node: StationNode
  nodeMap: Map<string, StationNode>
  depth: number
  visited: Set<string>
  selectedId: string | null
  onSelect: (id: string) => void
}

// 递归渲染单个层级节点及其子节点(带环检测)
function StationTreeNode({
  node,
  nodeMap,
  depth,
  visited,
  selectedId,
  onSelect
}: StationTreeNodeProps): React.JSX.Element | null {
  if (visited.has(node.id)) return null
  const nextVisited = new Set(visited).add(node.id)
  const children = node.children.map((id) => nodeMap.get(id)).filter(isNode)
  const meta = classMeta(node.class)

  return (
    <div className="station-tree__node">
      <button
        type="button"
        className={`station-node${node.id === selectedId ? ' is-active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(node.id)}
      >
        <span className="station-node__dot" style={{ backgroundColor: meta.color }} />
        <span className="station-node__name">{node.name}</span>
        <span className="station-node__type">{meta.label}</span>
      </button>
      {children.map((child) => (
        <StationTreeNode
          key={child.id}
          node={child}
          nodeMap={nodeMap}
          depth={depth + 1}
          visited={nextVisited}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

interface MaterialRowProps {
  node: StationNode
  selected: boolean
  onSelect: (id: string) => void
}

// 单个物料/试剂条目
function MaterialRow({ node, selected, onSelect }: MaterialRowProps): React.JSX.Element {
  const info = describeMaterial(node)
  return (
    <li>
      <button
        type="button"
        className={`mat-item${selected ? ' is-active' : ''}`}
        onClick={() => onSelect(node.id)}
      >
        <span className="mat-item__name">{node.name}</span>
        <span className="mat-item__reagent">{info.reagent}</span>
        {info.amount ? <span className="mat-item__amount">{info.amount}</span> : null}
        {info.state ? <span className="mat-item__state">{info.state}</span> : null}
      </button>
    </li>
  )
}

interface NodeDetailProps {
  node: StationNode
  graph: StationGraph
}

// 选中节点的详情
function NodeDetail({ node, graph }: NodeDetailProps): React.JSX.Element {
  const meta = classMeta(node.class)
  const connections = graph.links.filter((l) => l.source === node.id || l.target === node.id)
  const info = node.class === 'container' ? describeMaterial(node) : null
  return (
    <dl className="detail">
      <DetailRow label="名称" value={node.name} />
      <DetailRow label="ID" value={node.id} mono />
      <DetailRow label="类别" value={meta.label} />
      {node.position ? (
        <DetailRow label="位置" value={`x${node.position.x} · y${node.position.y}`} />
      ) : null}
      {info && info.reagent !== '空' ? <DetailRow label="试剂" value={info.reagent} /> : null}
      {info?.amount ? <DetailRow label="用量" value={info.amount} /> : null}
      <DetailRow label="连接" value={`${connections.length} 条管路`} />
    </dl>
  )
}

interface DetailRowProps {
  label: string
  value: string
  mono?: boolean
}

function DetailRow({ label, value, mono }: DetailRowProps): React.JSX.Element {
  return (
    <div className="detail__row">
      <dt>{label}</dt>
      <dd className={mono ? 'detail__mono' : undefined}>{value}</dd>
    </div>
  )
}

interface StationGroup {
  className: string
  label: string
  color: string
  nodes: StationNode[]
}

// 按 class 分组(根工作站排最前,其余按数量降序)
function buildGroups(nodes: StationNode[]): StationGroup[] {
  const byClass = new Map<string, StationNode[]>()
  nodes.forEach((node) => {
    const list = byClass.get(node.class) ?? []
    list.push(node)
    byClass.set(node.class, list)
  })
  return Array.from(byClass.entries())
    .map(([className, groupNodes]) => ({
      className,
      label: classMeta(className).label,
      color: classMeta(className).color,
      nodes: groupNodes
    }))
    .sort((a, b) => {
      if (a.className === 'workstation') return -1
      if (b.className === 'workstation') return 1
      return b.nodes.length - a.nodes.length
    })
}

interface MaterialInfo {
  reagent: string
  amount: string
  state: string
}

// 从容器节点提取物料信息(液体 liquids / 固体 reagent_name)
function describeMaterial(node: StationNode): MaterialInfo {
  const data = node.data ?? {}
  const liquids = readLiquids(data)
  if (liquids.length > 0) {
    const total = liquids.reduce((sum, item) => sum + item.volume, 0)
    const max = Number((node.config ?? {}).max_volume)
    const names = liquids.map((item) => item.name).join(' + ')
    const amount = Number.isFinite(max) && max > 0 ? `${total} / ${max} mL` : `${total} mL`
    return { reagent: names, amount, state: '液体' }
  }
  const reagentName = data.reagent_name
  if (reagentName != null) {
    const mass = Number(data.current_mass)
    const physical = data.physical_state
    return {
      reagent: String(reagentName),
      amount: Number.isFinite(mass) && mass > 0 ? `${mass} g` : '',
      state: physical === 'solid' ? '固体' : physical ? String(physical) : ''
    }
  }
  return { reagent: '空', amount: '', state: '' }
}

// 读取 data.liquids: [[name, volume], ...]
function readLiquids(data: Record<string, unknown>): Array<{ name: string; volume: number }> {
  const raw = data.liquids
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is unknown[] => Array.isArray(item))
    .map((pair) => ({ name: String(pair[0] ?? ''), volume: Number(pair[1]) || 0 }))
    .filter((item) => item.name.length > 0)
}

function classMeta(className: string): { label: string; color: string } {
  return CLASS_META[className] ?? { label: className || '未知', color: '#adb5bd' }
}

function isNode(value: StationNode | undefined): value is StationNode {
  return value != null
}
