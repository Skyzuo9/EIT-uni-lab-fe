/**
 * Drei Html elements are DOM portals. Keep their generated z-index far below
 * application overlays (drawers start at 1200) so scene labels cannot pierce
 * environment management or modal surfaces.
 */
export const PASCAL_SCENE_HTML_Z_INDEX_RANGE: [number, number] = [90, 0]
export const PASCAL_TRANSFER_HTML_Z_INDEX_RANGE: [number, number] = [80, 0]
export const PASCAL_TRANSFER_LABEL_Z_INDEX_RANGE: [number, number] = [70, 0]
