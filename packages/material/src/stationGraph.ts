/**
 * ============================================================
 * AI-GENERATED CODE METADATA
 * ============================================================
 * Model: Claude Opus 4.8
 * Generation Date: 2026-07-25
 * Prompt Summary: 工作站设备拓扑(node-link)类型定义 + 默认示例 JSON 文本
 * Context: 物料方向默认加载 comprehensive_station.json,驱动右侧工作站可视化
 * Human Review Status: [ ] Pending  [ ] Reviewed  [ ] Approved
 * ============================================================
 */
import stationRaw from './comprehensiveStation.json'

// 三维坐标(设备在工作站中的摆放位置)
export interface StationPosition {
  x: number
  y: number
  z: number
}

// 设备/物料节点(node-link 图中的一个节点)
export interface StationNode {
  id: string
  name: string
  children: string[]
  parent: string | null
  type: string
  class: string
  position?: StationPosition
  config?: Record<string, unknown>
  data?: Record<string, unknown>
}

// 设备间连接(流体/传输管路)
export interface StationLink {
  id: string
  source: string
  target: string
  type: string
  port?: Record<string, string>
}

// 工作站设备拓扑图
export interface StationGraph {
  nodes: StationNode[]
  links: StationLink[]
}

// 物料方向默认编辑器内容:comprehensive_station.json 的格式化文本
export const stationGraphJson: string = JSON.stringify(stationRaw, null, 2)
