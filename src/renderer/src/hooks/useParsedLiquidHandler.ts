/** [AI] Model: Claude Opus 4.8 | 2026-07-21 | YAML 文本 -> 物料配置（保留最近一次有效结果） */
import { useMemo, useRef } from 'react'
import { liquidHandlerConfig, type LiquidHandlerConfig } from '../data/liquidHandler'
import { parseLiquidHandlerYaml } from '../utils/parseLiquidHandler'

interface UseParsedLiquidHandlerResult {
  config: LiquidHandlerConfig
  error: string | null
}

// 实时解析 YAML 文本；解析失败时沿用上一次的有效配置并给出错误提示
export function useParsedLiquidHandler(yamlText: string): UseParsedLiquidHandlerResult {
  const lastValidRef = useRef<LiquidHandlerConfig>(liquidHandlerConfig)

  return useMemo(() => {
    const { config, error } = parseLiquidHandlerYaml(yamlText)
    if (config) {
      lastValidRef.current = config
      return { config, error: null }
    }
    return { config: lastValidRef.current, error }
  }, [yamlText])
}
