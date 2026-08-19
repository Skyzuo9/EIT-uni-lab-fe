import { MaterialShapeThumbnail } from '@unilab/material'
import type { MaterialShapeSpec } from '@unilab/material'

/** Render the same registry shape (or neutral package fallback) everywhere. */
export default function WorkflowMaterialShapeGlyph({
  shape
}: {
  shape?: MaterialShapeSpec
}): React.JSX.Element {
  if (shape) return <MaterialShapeThumbnail shape={shape} />
  return (
    <svg
      aria-hidden="true"
      data-material-shape-source="default"
      focusable="false"
      viewBox="0 0 48 48"
    >
      <path d="m12 20 12-6 12 6-12 6-12-6Z" />
      <path d="m12 20v8l12 6 12-6v-8" />
      <path d="m17 17.5 12 6" />
      <path d="m31 17.5-12 6" />
    </svg>
  )
}
