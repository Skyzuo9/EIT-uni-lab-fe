/** [AI] Model: Claude Opus 4.8 | 2026-07-25 | JSON 文本 -> 工作站拓扑（保留最近一次有效结果） */
import { useMemo, useRef } from 'react'
import type { StationGraph } from './stationGraph'
import { parseStationGraphJson } from './parseStationGraph'

interface UseParsedStationGraphResult {
  graph: StationGraph
  error: string | null
}

const EMPTY_GRAPH: StationGraph = { nodes: [], links: [] }

// 将编辑器 JSON 文本解析为工作站拓扑;解析失败时沿用上一次有效结果并返回错误
export function useParsedStationGraph(jsonText: string): UseParsedStationGraphResult {
  const lastValidRef = useRef<StationGraph>(EMPTY_GRAPH)

  return useMemo(() => {
    const { graph, error } = parseStationGraphJson(jsonText)
    if (graph) {
      lastValidRef.current = graph
      return { graph, error: null }
    }
    return { graph: lastValidRef.current, error }
  }, [jsonText])
}
