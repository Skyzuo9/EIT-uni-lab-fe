import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode
} from 'react'

export type LabViewMode = '2d' | '2.5d' | '3d' | 'split'

const STORAGE_KEY = 'unilab.lab.view-mode'
const SITE_LAYER_STORAGE_KEY = 'unilab.lab.site-layer-visible'
const MATERIAL_TRANSFER_LAYER_STORAGE_KEY =
  'unilab.lab.material-transfer-layer-visible'

export interface LabViewOptions {
  showSites: boolean
  showMaterialTransfers: boolean
}

export interface LabMaterialRoleFilterOption {
  value: string
  label: string
  accent: string
  lineageCount: number
}

export interface UnifiedLabViewportProps {
  renderView: (mode: LabViewMode, options: LabViewOptions) => ReactNode
  materialRoleFilter?: string | null
  materialRoleOptions?: readonly LabMaterialRoleFilterOption[]
  onMaterialRoleFilterChange?: (materialRole: string | null) => void
}

/**
 * One host-owned mode switch drives Pascal's native 2D/3D/split state. The
 * app-owned 2.5D projection consumes the same Material aggregates while the
 * Pascal/WebGL tree stays mounted underneath.
 */
export function UnifiedLabViewport({
  renderView,
  materialRoleFilter = null,
  materialRoleOptions = [],
  onMaterialRoleFilterChange
}: UnifiedLabViewportProps): React.JSX.Element {
  const [mode, setMode] = useState<LabViewMode>(readStoredMode)
  const [showSites, setShowSites] = useState(readStoredSiteLayer)
  const [showMaterialTransfers, setShowMaterialTransfers] = useState(
    readStoredMaterialTransferLayer
  )

  useEffect(() => {
    globalThis.localStorage?.setItem(STORAGE_KEY, mode)
  }, [mode])

  useEffect(() => {
    globalThis.localStorage?.setItem(
      SITE_LAYER_STORAGE_KEY,
      String(showSites)
    )
  }, [showSites])

  useEffect(() => {
    globalThis.localStorage?.setItem(
      MATERIAL_TRANSFER_LAYER_STORAGE_KEY,
      String(showMaterialTransfers)
    )
  }, [showMaterialTransfers])

  return (
    <div
      className="lab-unified-viewport"
      data-lab-view-mode={mode}
      data-site-layer-visible={showSites}
      data-material-transfer-layer-visible={showMaterialTransfers}
    >
      <div className="lab-unified-viewport__surface">
        <LabViewErrorBoundary mode={mode}>
          <LabViewSurface
            mode={mode}
            renderView={renderView}
            showSites={showSites}
            showMaterialTransfers={showMaterialTransfers}
          />
        </LabViewErrorBoundary>
      </div>
      <div className="lab-viewport-controls">
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
            label="分屏"
            onClick={() => setMode('split')}
          />
        </div>
        <div
          aria-label="场景图层"
          className="lab-site-layer-toggle"
          role="group"
        >
          <button
            type="button"
            aria-label="库位和点位"
            aria-pressed={showSites}
            className={showSites ? 'is-active' : undefined}
            onClick={() => setShowSites((visible) => !visible)}
            title={showSites ? '隐藏库位和点位' : '显示库位和点位'}
          >
            <SiteLayerIcon />
            <span>库位和点位</span>
            <i aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="物料转运"
            aria-pressed={showMaterialTransfers}
            className={showMaterialTransfers ? 'is-active is-transfer' : undefined}
            onClick={() => setShowMaterialTransfers((visible) => !visible)}
            title={showMaterialTransfers
              ? '隐藏物料转运路线'
              : '显示物料转运路线'}
          >
            <TransferLayerIcon />
            <span>物料转运</span>
            <i aria-hidden="true" />
          </button>
        </div>
        {materialRoleOptions.length > 0 && onMaterialRoleFilterChange && (
          <details className="lab-material-role-filter">
            <summary aria-label={`按物料角色筛选：${
              materialRoleOptions.find((option) =>
                option.value === materialRoleFilter
              )?.label ?? '全部'
            }`}>
              <FilterIcon />
              <span>
                {materialRoleOptions.find((option) =>
                  option.value === materialRoleFilter
                )?.label ?? '全部物料'}
              </span>
            </summary>
            <div role="radiogroup" aria-label="物料画布角色">
              <button
                type="button"
                role="radio"
                aria-checked={!materialRoleFilter}
                className={!materialRoleFilter ? 'is-active' : undefined}
                onClick={() => onMaterialRoleFilterChange(null)}
              >
                <i className="is-all" aria-hidden="true" />
                <span>全部物料</span>
              </button>
              {materialRoleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={materialRoleFilter === option.value}
                  className={materialRoleFilter === option.value
                    ? 'is-active'
                    : undefined}
                  onClick={() => onMaterialRoleFilterChange(option.value)}
                >
                  <i
                    aria-hidden="true"
                    style={{ backgroundColor: option.accent }}
                  />
                  <span>{option.label}</span>
                  <small>{option.lineageCount}</small>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

function FilterIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M3 4h14l-5.4 6.2v4.4l-3.2 1.8v-6.2L3 4Z" />
    </svg>
  )
}

function LabViewSurface({
  mode,
  renderView,
  showSites,
  showMaterialTransfers
}: {
  mode: LabViewMode
  renderView: UnifiedLabViewportProps['renderView']
  showSites: boolean
  showMaterialTransfers: boolean
}): React.JSX.Element {
  return <>{renderView(mode, { showSites, showMaterialTransfers })}</>
}

interface LabViewErrorBoundaryProps {
  children: ReactNode
  mode: LabViewMode
}

interface LabViewErrorBoundaryState {
  error: Error | null
}

class LabViewErrorBoundary extends Component<
  LabViewErrorBoundaryProps,
  LabViewErrorBoundaryState
> {
  state: LabViewErrorBoundaryState = { error: null }

  static getDerivedStateFromError(
    error: unknown
  ): LabViewErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error))
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      '[LabViewErrorBoundary]',
      error,
      info.componentStack
    )
  }

  componentDidUpdate(
    previousProps: LabViewErrorBoundaryProps
  ): void {
    if (
      previousProps.mode !== this.props.mode &&
      this.state.error
    ) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        className="lab-unified-viewport__error"
        role="alert"
      >
        <strong>当前视图加载失败</strong>
        <span>可使用下方按钮切换到 2D、2.5D 或重新尝试 3D。</span>
        <details>
          <summary>查看技术信息</summary>
          <code>{error.message}</code>
        </details>
      </div>
    )
  }
}

function ObliqueIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 16">
      <path d="m2 6 8-4 6 3-8 4-6-3Z" />
      <path d="M2 6v5l6 3 8-4V5M8 9v5" />
    </svg>
  )
}

function SiteLayerIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 16">
      <path d="m2 6 7-3.5L16 6l-7 3.5L2 6Z" />
      <path d="M2 6v5l7 3.5 7-3.5V6" />
      <circle cx="9" cy="6" r="1.5" />
    </svg>
  )
}

function TransferLayerIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 16">
      <circle cx="3" cy="12" r="1.5" />
      <circle cx="15" cy="4" r="1.5" />
      <path d="M4.5 12h3V7h3V4h3" />
      <path d="m11.5 2.5 2 1.5-2 1.5" />
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

function readStoredSiteLayer(): boolean {
  return globalThis.localStorage?.getItem(SITE_LAYER_STORAGE_KEY) !== 'false'
}

function readStoredMaterialTransferLayer(): boolean {
  return globalThis.localStorage?.getItem(
    MATERIAL_TRANSFER_LAYER_STORAGE_KEY
  ) !== 'false'
}
