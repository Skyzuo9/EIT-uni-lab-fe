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
    void Promise.resolve(adapter.storage.load(storageKey))
      .then((stored) => {
        if (active && stored) {
          setDocument(adapter.parseLayout(stored))
        }
      })
      .catch(() => {
        // A corrupt saved layout must not prevent the canonical preset loading.
      })
    return () => {
      active = false
    }
  }, [adapter, storageKey])

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
    <div className="lab-panel-workspace">
      <PanelLayoutRenderer
        adapter={adapter}
        document={document}
        onCommand={handleCommand}
      />
    </div>
  )
}
