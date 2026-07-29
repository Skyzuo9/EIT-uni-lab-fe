import type { PanelDefinition } from '@unilab/workbench-layout'

export const LAB_MAP_V2_QUERY_FLAG = 'experimentalLabMapV2'
export const LAB_MAP_V2_PANEL_ID = 'experimental-lab-map-v2'

export const LAB_MAP_V2_PANEL_DEFINITION = {
  id: LAB_MAP_V2_PANEL_ID,
  title: '实验室地图（实验）',
  category: 'layout',
  singleton: true,
  defaultSize: { minWidth: 640, minHeight: 420 },
  closability: 'when-multiple-tabs',
  capabilityPolicy: {
    rendererRequired: true,
    unavailableCode: 'PANEL_CAPABILITY_UNAVAILABLE'
  }
} satisfies PanelDefinition

export function isLabMapV2Enabled(): boolean {
  const search = globalThis.location?.search
  if (!search) return false
  return new URLSearchParams(search).get(LAB_MAP_V2_QUERY_FLAG) === '1'
}
