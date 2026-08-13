/**
 * Material kinds whose labels add noise when every instance is visible.
 * These objects remain discoverable through hover, focus, selection, and
 * inspection; only their default persistent label is suppressed.
 */
const INTERACTION_ONLY_LABEL_KIND_TOKENS = [
  'plate',
  'tip-box',
  'tipbox',
  'tip-rack',
  'tiprack',
  'labware',
  'container',
  'reagent',
  'sample',
  'tube',
  'beaker',
  'vial',
  'bottle',
  'trash',
  'deck'
] as const

/**
 * Carriers are spatial landmarks even when their kind includes the name of
 * the labware they contain (for example `beaker_stack` or `plate-hotel`).
 */
const LANDMARK_CARRIER_KIND_TOKENS = ['stack', 'hotel'] as const

/**
 * Decides whether a material label should be persistently visible before any
 * interaction. Top-level equipment and spatial carriers are landmarks;
 * ordinary labware, consumables, samples, and deck contents are shown on
 * hover/focus/selection instead.
 */
export function shouldShowMaterialLabelByDefault(kind: string): boolean {
  const normalized = kind.replaceAll('_', '-').toLowerCase()
  if (
    LANDMARK_CARRIER_KIND_TOKENS.some((token) =>
      normalized.includes(token)
    )
  ) {
    return true
  }
  return !INTERACTION_ONLY_LABEL_KIND_TOKENS.some((token) =>
    normalized.includes(token)
  )
}
