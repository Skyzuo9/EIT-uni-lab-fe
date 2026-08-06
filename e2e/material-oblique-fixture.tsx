import { createRoot } from 'react-dom/client'

import { MaterialObliqueCanvas } from '../packages/material/src/oblique/MaterialObliqueCanvas'
import { materialAggregate } from '../packages/material/src/testFixtures'
import styles from './materialObliqueFixture.module.scss'

const aggregates = [
  materialAggregate('fixture-left', {
    placement: {
      kind: 'world',
      pose: {
        positionMm: [-220, 0, 0],
        rotationDegXYZ: [0, 0, 0]
      }
    },
    config: {
      rendering: {
        kind: 'fixture-left',
        dimensionsMm: [300, 180, 140]
      }
    }
  }),
  materialAggregate('fixture-right', {
    placement: {
      kind: 'world',
      pose: {
        positionMm: [240, 120, 0],
        rotationDegXYZ: [0, 0, 0]
      }
    },
    config: {
      rendering: {
        kind: 'fixture-right',
        dimensionsMm: [180, 260, 220]
      }
    }
  })
]

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')
createRoot(root).render(
  <main className={styles.fixture}>
    <MaterialObliqueCanvas aggregates={aggregates} />
  </main>
)
