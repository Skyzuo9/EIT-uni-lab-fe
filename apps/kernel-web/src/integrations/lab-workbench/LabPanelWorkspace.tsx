import {
  PanelLayoutRenderer,
  reducePanelLayout,
  type PanelLayoutCommand,
  type PanelLayoutDocument
} from '@unilab/workbench-layout'
import {
  useCallback,
  useEffect,
  useState
} from 'react'

import { useLabPanelAdapter } from './panelAdapter'
import {
  panelPresetDocument,
  parsePanelPresetDocument,
  type LabPanelPreset
} from './panelLayouts'

export function LabPanelWorkspace({
  preset
}: {
  preset: LabPanelPreset
}): React.JSX.Element {
  return <LabPanelWorkspaceSession key={preset} preset={preset} />
}

function LabPanelWorkspaceSession({
  preset
}: {
  preset: LabPanelPreset
}): React.JSX.Element {
  const adapter = useLabPanelAdapter()
  const storageKey = `unilab.panel-layout.${preset}.v1`
  const [document, setDocument] = useState<PanelLayoutDocument>(
    () => panelPresetDocument(preset)
  )

  useEffect(() => {
    let active = true
    void Promise.resolve()
      .then(() => adapter.storage.load(storageKey))
      .then((stored) => {
        if (active && stored) {
          setDocument(parsePanelPresetDocument(preset, stored))
        }
      })
      .catch(() => {
        if (!active) {
          return
        }

        const fallback = panelPresetDocument(preset)
        setDocument(fallback)
        try {
          void Promise.resolve(
            adapter.storage.save(storageKey, fallback)
          ).catch(() => {
            // The in-memory fallback still keeps the preset usable.
          })
        } catch {
          // The in-memory fallback still keeps the preset usable.
        }
      })
    return () => {
      active = false
    }
  }, [adapter, preset, storageKey])

  const handleCommand = useCallback(
    (command: PanelLayoutCommand) => {
      setDocument((current) => {
        const next = reducePanelLayout(
          current,
          command,
          adapter.registry.list()
        )
        void Promise.resolve(
          adapter.storage.save(storageKey, next)
        )
        return next
      })
    },
    [adapter, storageKey]
  )

  return (
    <div className={`lab-panel-workspace lab-panel-workspace--${preset}`}>
      <PanelLayoutRenderer
        adapter={adapter}
        document={document}
        onCommand={handleCommand}
      />
    </div>
  )
}
