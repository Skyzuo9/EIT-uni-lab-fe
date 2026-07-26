import {
  useEffect,
  useState,
  type ReactNode
} from 'react'

export type LabViewMode = '2d' | '2.5d' | '3d' | 'split'

const STORAGE_KEY = 'unilab.lab.view-mode'

export interface UnifiedLabViewportProps {
  renderView: (mode: LabViewMode) => ReactNode
}

/**
 * One host-owned mode switch drives Pascal's native 2D/3D/split state. The
 * app-owned 2.5D projection consumes the same Material aggregates while the
 * Pascal/WebGL tree stays mounted underneath.
 */
export function UnifiedLabViewport({
  renderView
}: UnifiedLabViewportProps): React.JSX.Element {
  const [mode, setMode] = useState<LabViewMode>(readStoredMode)

  useEffect(() => {
    globalThis.localStorage?.setItem(STORAGE_KEY, mode)
  }, [mode])

  return (
    <div
      className="lab-unified-viewport"
      data-lab-view-mode={mode}
    >
      <div className="lab-unified-viewport__surface">
        {renderView(mode)}
      </div>
      <div
        aria-label="实验室视图"
        className="lab-view-mode-toggle"
        role="group"
      >
        <ViewModeButton
          active={mode === '2d'}
          icon={<GridIcon />}
          label="2D"
          onClick={() => setMode('2d')}
        />
        <ViewModeButton
          active={mode === '2.5d'}
          icon={<ObliqueIcon />}
          label="2.5D"
          onClick={() => setMode('2.5d')}
        />
        <ViewModeButton
          active={mode === '3d'}
          icon={<CubeIcon />}
          label="3D"
          onClick={() => setMode('3d')}
        />
        <ViewModeButton
          active={mode === 'split'}
          icon={<SplitIcon />}
          label="Split"
          onClick={() => setMode('split')}
        />
      </div>
    </div>
  )
}

function ObliqueIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 16">
      <path d="m2 6 8-4 6 3-8 4-6-3Z" />
      <path d="M2 6v5l6 3 8-4V5M8 9v5" />
    </svg>
  )
}

function ViewModeButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={active ? 'is-active' : undefined}
      onClick={onClick}
      title={`${label} 视图`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function GridIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  )
}

function CubeIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m8 1.8 5.7 3.1v6.2L8 14.2l-5.7-3.1V4.9L8 1.8Z" />
      <path d="m2.6 5 5.4 3 5.4-3M8 8v6" />
    </svg>
  )
}

function SplitIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 16">
      <rect x="1.5" y="2" width="7" height="12" rx="1.5" />
      <path d="m14.5 2 4 2.3v7.4l-4 2.3-4-2.3V4.3l4-2.3Z" />
      <path d="m10.7 4.5 3.8 2.2 3.8-2.2m-3.8 2.2v7" />
    </svg>
  )
}

function readStoredMode(): LabViewMode {
  const value = globalThis.localStorage?.getItem(STORAGE_KEY)
  return value === '2d' ||
    value === '2.5d' ||
    value === '3d' ||
    value === 'split'
    ? value
    : '2d'
}
