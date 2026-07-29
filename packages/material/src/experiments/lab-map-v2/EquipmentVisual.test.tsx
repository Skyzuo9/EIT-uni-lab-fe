import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LAB_MAP_EQUIPMENT_TEMPLATES } from './draftEquipment'
import { EquipmentThumbnail } from './EquipmentVisual'

describe('Lab Map equipment visuals', () => {
  it('renders a distinct isometric preview for every template', () => {
    const markup = LAB_MAP_EQUIPMENT_TEMPLATES.map(
      (template) =>
        renderToStaticMarkup(
          <EquipmentThumbnail template={template} />
        )
    ).join('')

    expect(markup.match(/data-equipment-preview="isometric"/g))
      .toHaveLength(LAB_MAP_EQUIPMENT_TEMPLATES.length)
    for (const template of LAB_MAP_EQUIPMENT_TEMPLATES) {
      expect(markup).toContain(
        `data-equipment-visual="${template.id}"`
      )
    }
  })
})
