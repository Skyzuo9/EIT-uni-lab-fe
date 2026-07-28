import { useState, type ReactNode } from 'react'

type DeviceId = 'robot' | 'camera'
type RobotMode = 'cartesian' | 'joint'

interface RobotDeviceState {
  enabled: boolean
  emergencyStopped: boolean
  paused: boolean
  speed: number
  mode: RobotMode
  activeJog: string | null
  lastAction: string
}

interface CameraDeviceState {
  sampleId: string
  saveDir: string
  filename: string
  profile: string
  exposure: number
  gain: number
  captureCount: number
  lastCapture: string | null
}

const CARTESIAN_JOGS = ['X−', 'Y+', 'X+', 'Rx−', 'Ry+', 'Rx+']
const CARTESIAN_JOGS_SECONDARY = ['Y−', 'Z+', 'Z−', 'Ry−', 'Rz+', 'Rz−']
const JOINT_JOGS = ['J1−', 'J1+', 'J2−', 'J2+', 'J3−', 'J3+']
const JOINT_JOGS_SECONDARY = ['J4−', 'J4+', 'J5−', 'J5+', 'J6−', 'J6+']

export default function DevicePanel(): React.JSX.Element {
  const [selectedDevice, setSelectedDevice] = useState<DeviceId>('robot')
  const [robot, setRobot] = useState<RobotDeviceState>({
    enabled: true,
    emergencyStopped: false,
    paused: false,
    speed: 20,
    mode: 'cartesian',
    activeJog: null,
    lastAction: '状态已刷新'
  })
  const [camera, setCamera] = useState<CameraDeviceState>({
    sampleId: 'PTLC-2026-0728-01',
    saveDir: '/data/ptlc/captures',
    filename: 'after.jpg',
    profile: 'photoscrape',
    exposure: 1_000_000,
    gain: 1,
    captureCount: 0,
    lastCapture: null
  })

  const runRobotAction = (action: string): void => {
    setRobot((current) => ({ ...current, lastAction: action }))
  }

  const startJog = (axis: string): void => {
    setRobot((current) => ({
      ...current,
      activeJog: axis,
      lastAction: `点动 ${axis}`
    }))
  }

  const stopJog = (): void => {
    setRobot((current) => ({
      ...current,
      activeJog: null,
      lastAction: current.activeJog ? `停止点动 ${current.activeJog}` : current.lastAction
    }))
  }

  const capture = (): void => {
    const time = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date())
    setCamera((current) => ({
      ...current,
      captureCount: current.captureCount + 1,
      lastCapture: time
    }))
  }

  const sharedProps = {
    robot,
    camera,
    setRobot,
    setCamera,
    runRobotAction,
    startJog,
    stopJog,
    capture
  }

  return (
    <DevicePage
      {...sharedProps}
      selectedDevice={selectedDevice}
      setSelectedDevice={setSelectedDevice}
    />
  )
}

interface ControlProps {
  robot: RobotDeviceState
  camera: CameraDeviceState
  setRobot: React.Dispatch<React.SetStateAction<RobotDeviceState>>
  setCamera: React.Dispatch<React.SetStateAction<CameraDeviceState>>
  runRobotAction: (action: string) => void
  startJog: (axis: string) => void
  stopJog: () => void
  capture: () => void
}

interface DevicePageProps extends ControlProps {
  selectedDevice: DeviceId
  setSelectedDevice: (deviceId: DeviceId) => void
}

function DevicePage({
  selectedDevice,
  setSelectedDevice,
  ...controls
}: DevicePageProps): React.JSX.Element {
  return (
    <section className="section section--split device-page ptlc-device">
      <aside className="section__list" aria-label="设备列表">
        <DevicePageHeading />
        <ul className="device-list">
          <DeviceListItem
            id="robot"
            name="机械臂"
            detail="Dobot TCP-IP-V4"
            icon={<RobotIcon />}
            selected={selectedDevice === 'robot'}
            onSelect={setSelectedDevice}
          />
          <DeviceListItem
            id="camera"
            name="相机"
            detail="Daheng · RGB8"
            icon={<CameraIcon />}
            selected={selectedDevice === 'camera'}
            onSelect={setSelectedDevice}
          />
        </ul>
        <div className="ptlc-device__notice">
          <span>本地模拟</span>
          当前未接入真实设备，控制状态仅保存在浏览器内存中。
        </div>
      </aside>
      <main
        className="section__detail ptlc-device__detail"
        aria-label="设备控制详情"
      >
        {selectedDevice === 'robot' ? (
          <RobotConsole {...controls} />
        ) : (
          <CameraConsole {...controls} />
        )}
      </main>
    </section>
  )
}

function DevicePageHeading(): React.JSX.Element {
  return (
    <header className="section__list-head">
      <div>
        <h1 className="section__list-title">仪器设备</h1>
        <span className="section__list-meta">
          2 台设备 · 本地演示
        </span>
      </div>
      <span className="ptlc-device__local-badge">
        <span aria-hidden="true" />
        未连接真实设备
      </span>
    </header>
  )
}

function DeviceListItem({
  id,
  name,
  detail,
  icon,
  selected,
  onSelect
}: {
  id: DeviceId
  name: string
  detail: string
  icon: ReactNode
  selected: boolean
  onSelect: (deviceId: DeviceId) => void
}): React.JSX.Element {
  return (
    <li>
      <button
        type="button"
        className={`device-list__item ptlc-device__device-item${
          selected ? ' is-active' : ''
        }`}
        aria-pressed={selected}
        onClick={() => onSelect(id)}
      >
        <span className="ptlc-device__device-icon">{icon}</span>
        <span className="ptlc-device__device-copy">
          <span className="device-list__row">
            <span className="device-list__status is-online" />
            <span className="device-list__name">{name}</span>
          </span>
          <span className="device-list__key">{detail}</span>
        </span>
        <span className="ptlc-device__chevron" aria-hidden="true">›</span>
      </button>
    </li>
  )
}

function RobotConsole({
  robot,
  setRobot,
  runRobotAction,
  startJog,
  stopJog
}: ControlProps): React.JSX.Element {
  return (
    <div className="ptlc-console">
      <DeviceIdentity
        icon={<RobotIcon />}
        name="机械臂"
        detail="Dobot TCP-IP-V4 · 192.168.0.15"
      />
      <RobotStatusStrip robot={robot} />
      <div className="ptlc-console__grid">
        <div className="ptlc-console__main">
          <JogControl
            robot={robot}
            setRobot={setRobot}
            runRobotAction={runRobotAction}
            startJog={startJog}
            stopJog={stopJog}
          />
          <SafetyActions
            robot={robot}
            setRobot={setRobot}
            runRobotAction={runRobotAction}
          />
        </div>
        <RobotTelemetry robot={robot} />
      </div>
    </div>
  )
}

function DeviceIdentity({
  icon,
  name,
  detail
}: {
  icon: ReactNode
  name: string
  detail: string
}): React.JSX.Element {
  return (
    <header className="ptlc-console__identity">
      <span className="ptlc-console__identity-icon">{icon}</span>
      <div>
        <h2>{name}</h2>
        <p>{detail}</p>
      </div>
      <span className="ptlc-status-badge is-online">模拟在线</span>
    </header>
  )
}

function RobotStatusStrip({
  robot
}: {
  robot: RobotDeviceState
}): React.JSX.Element {
  const mode = robot.emergencyStopped
    ? '急停'
    : robot.paused
      ? '已暂停'
      : robot.enabled
        ? '已使能'
        : '未使能'
  return (
    <div className="ptlc-status-strip" aria-label="机器人当前状态">
      <StatusMetric label="运行模式" value="DEBUG" tone="warning" />
      <StatusMetric
        label="机器人状态"
        value={mode}
        tone={robot.emergencyStopped ? 'danger' : robot.paused ? 'warning' : 'success'}
      />
      <StatusMetric label="当前工具" value="吸盘 · Slot 1" />
      <StatusMetric label="速度比" value={`${robot.speed}%`} />
    </div>
  )
}

function StatusMetric({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone?: 'success' | 'warning' | 'danger'
}): React.JSX.Element {
  return (
    <span className={`ptlc-status-metric${tone ? ` is-${tone}` : ''}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  )
}

function JogControl({
  robot,
  setRobot,
  runRobotAction,
  startJog,
  stopJog
}: Pick<
  ControlProps,
  'robot' | 'setRobot' | 'runRobotAction' | 'startJog' | 'stopJog'
>): React.JSX.Element {
  const firstRow = robot.mode === 'cartesian' ? CARTESIAN_JOGS : JOINT_JOGS
  const secondRow =
    robot.mode === 'cartesian' ? CARTESIAN_JOGS_SECONDARY : JOINT_JOGS_SECONDARY
  const disabled = robot.emergencyStopped || !robot.enabled

  return (
    <section className="ptlc-control-group">
      <div className="ptlc-control-group__head">
        <h3>手动点动</h3>
        <div className="ptlc-segmented" role="group" aria-label="点动坐标系">
          <button
            type="button"
            className={robot.mode === 'cartesian' ? 'is-active' : ''}
            onClick={() => setRobot((current) => ({ ...current, mode: 'cartesian' }))}
          >
            笛卡尔
          </button>
          <button
            type="button"
            className={robot.mode === 'joint' ? 'is-active' : ''}
            onClick={() => setRobot((current) => ({ ...current, mode: 'joint' }))}
          >
            关节
          </button>
        </div>
      </div>
      <div className="ptlc-jog-grid">
        {[...firstRow, ...secondRow].map((axis) => (
          <button
            key={axis}
            type="button"
            className={robot.activeJog === axis ? 'is-active' : ''}
            disabled={disabled}
            onPointerDown={() => startJog(axis)}
            onPointerUp={stopJog}
            onPointerCancel={stopJog}
            onPointerLeave={stopJog}
            onClick={() => runRobotAction(`步进 ${axis}`)}
          >
            {axis}
          </button>
        ))}
      </div>
      <div className="ptlc-speed-control">
        <label htmlFor="robot-speed">
          <span>全局速度比</span>
          <strong>{robot.speed}%</strong>
        </label>
        <input
          id="robot-speed"
          type="range"
          min="1"
          max="100"
          value={robot.speed}
          onChange={(event) => {
            const speed = Number(event.target.value)
            setRobot((current) => ({
              ...current,
              speed,
              lastAction: `设置速度比 ${speed}%`
            }))
          }}
        />
        <div className="ptlc-speed-control__marks">
          <span>1</span><span>20</span><span>50</span><span>100</span>
        </div>
      </div>
    </section>
  )
}

function SafetyActions({
  robot,
  setRobot,
  runRobotAction
}: Pick<ControlProps, 'robot' | 'setRobot' | 'runRobotAction'>): React.JSX.Element {
  return (
    <section className="ptlc-control-group">
      <div className="ptlc-control-group__head">
        <h3>运动与安全</h3>
      </div>
      <div className="ptlc-action-grid">
        <button
          type="button"
          className="ptlc-control-button"
          disabled={robot.emergencyStopped}
          onClick={() => runRobotAction('回原点')}
        >
          <HomeIcon />回原点
        </button>
        <button
          type="button"
          className="ptlc-control-button"
          disabled={robot.emergencyStopped}
          onClick={() => {
            setRobot((current) => ({ ...current, paused: !current.paused }))
            runRobotAction(robot.paused ? '恢复运动' : '暂停运动')
          }}
        >
          {robot.paused ? <PlayIcon /> : <PauseIcon />}
          {robot.paused ? '恢复' : '暂停'}
        </button>
        <button
          type="button"
          className="ptlc-control-button"
          onClick={() => runRobotAction('中止运动')}
        >
          <StopIcon />中止
        </button>
        <button
          type="button"
          className={`ptlc-control-button ptlc-control-button--danger${
            robot.emergencyStopped ? ' is-active' : ''
          }`}
          onClick={() => setRobot((current) => ({
            ...current,
            emergencyStopped: !current.emergencyStopped,
            activeJog: null,
            lastAction: current.emergencyStopped ? '释放急停' : '触发急停'
          }))}
        >
          <EmergencyIcon />
          {robot.emergencyStopped ? '释放急停' : '急停'}
        </button>
      </div>
      <p className="ptlc-control-group__state">
        最近指令 <strong>{robot.lastAction}</strong>
      </p>
    </section>
  )
}

function RobotTelemetry({
  robot
}: {
  robot: RobotDeviceState
}): React.JSX.Element {
  const pose = [
    ['X', '−327.44 mm'],
    ['Y', '−18.20 mm'],
    ['Z', '421.08 mm'],
    ['Rx', '179.98°'],
    ['Ry', '0.32°'],
    ['Rz', '−91.24°']
  ]
  const joints = ['12.4°', '−38.1°', '76.8°', '−1.2°', '52.7°', '9.6°']
  return (
    <aside className="ptlc-telemetry">
      <div className="ptlc-control-group__head">
        <h3>实时位姿</h3>
        <span className="ptlc-telemetry__refresh">20 Hz</span>
      </div>
      <dl className="ptlc-telemetry__pose">
        {pose.map(([axis, value]) => (
          <div key={axis}>
            <dt>{axis}</dt><dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="ptlc-telemetry__joints">
        {joints.map((value, index) => (
          <span key={value}>
            <small>J{index + 1}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      <div className="ptlc-telemetry__flags">
        <span><i className={robot.enabled ? 'is-on' : ''} />Servo</span>
        <span><i className={!robot.emergencyStopped ? 'is-on' : ''} />Safety</span>
        <span><i className="is-on" />Tool DI</span>
      </div>
    </aside>
  )
}

function CameraConsole({
  camera,
  setCamera,
  capture
}: ControlProps): React.JSX.Element {
  return (
    <div className="ptlc-console">
      <DeviceIdentity
        icon={<CameraIcon />}
        name="相机"
        detail="Daheng · RGB8 · Software Trigger"
      />
      <CameraViewport camera={camera} />
      <div className="ptlc-camera-console__lower">
        <CameraSettings
          camera={camera}
          setCamera={setCamera}
        />
        <div className="ptlc-camera-console__capture">
          <button
            type="button"
            className="ptlc-control-button ptlc-control-button--primary"
            onClick={capture}
          >
            <CaptureIcon />
            采集图像
          </button>
          <p role="status" aria-live="polite">
            {camera.lastCapture
              ? `${camera.lastCapture} 已采集 · 共 ${camera.captureCount} 张`
              : '尚未采集 · 预览为前端模拟画面'}
          </p>
        </div>
      </div>
    </div>
  )
}

function CameraViewport({
  camera
}: {
  camera: CameraDeviceState
}): React.JSX.Element {
  return (
    <div className="ptlc-camera-view">
      <div className="ptlc-camera-view__toolbar">
        <span><i />LIVE · 2448 × 2048</span>
        <span>{camera.exposure.toLocaleString()} µs · Gain {camera.gain}</span>
      </div>
      <div className="ptlc-camera-view__frame" aria-label="相机模拟预览">
        <div className="ptlc-camera-view__plate">
          <span className="band band--1" />
          <span className="band band--2" />
          <span className="band band--3" />
          <span className="band band--4" />
          <span className="origin-line" />
        </div>
        <span className="ptlc-camera-view__crosshair" />
        <span className="ptlc-camera-view__scale">20 mm</span>
        <span className="ptlc-camera-view__simulation">SIMULATED PREVIEW</span>
      </div>
    </div>
  )
}

function CameraSettings({
  camera,
  setCamera
}: Pick<ControlProps, 'camera' | 'setCamera'>): React.JSX.Element {
  const update = <Key extends keyof CameraDeviceState>(
    key: Key,
    value: CameraDeviceState[Key]
  ): void => {
    setCamera((current) => ({ ...current, [key]: value }))
  }
  return (
    <div className="ptlc-camera-settings">
      <label>
        <span>样品 ID</span>
        <input
          value={camera.sampleId}
          onChange={(event) => update('sampleId', event.target.value)}
        />
      </label>
      <label>
        <span>文件名</span>
        <input
          value={camera.filename}
          onChange={(event) => update('filename', event.target.value)}
        />
      </label>
      <label className="is-wide">
        <span>保存目录</span>
        <input
          value={camera.saveDir}
          onChange={(event) => update('saveDir', event.target.value)}
        />
      </label>
      <label>
        <span>采集 Profile</span>
        <select
          value={camera.profile}
          onChange={(event) => update('profile', event.target.value)}
        >
          <option value="photoscrape">photoscrape</option>
          <option value="">仅参数覆写</option>
        </select>
      </label>
      <label>
        <span>曝光时间 (µs)</span>
        <input
          type="number"
          min="1"
          value={camera.exposure}
          onChange={(event) => update('exposure', Number(event.target.value))}
        />
      </label>
      <label>
        <span>增益</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={camera.gain}
          onChange={(event) => update('gain', Number(event.target.value))}
        />
      </label>
    </div>
  )
}

function RobotIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 20h8M12 16v4M9 4h6l1 5-4 3-4-3 1-5Z" />
      <path d="m8.5 8.5-3 3v3.5M15.5 8.5l3 3v3.5M3.5 15h4M16.5 15h4" />
    </svg>
  )
}

function CameraIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7.5h3l1.5-2h7l1.5 2h3v11H4v-11Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

function HomeIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m3 9 7-6 7 6v8H5V9M8 17v-5h4v5" />
    </svg>
  )
}

function PauseIcon(): React.JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M6 4h3v12H6zM11 4h3v12h-3z" /></svg>
}

function PlayIcon(): React.JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m6 4 10 6-10 6V4Z" /></svg>
}

function StopIcon(): React.JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1" /></svg>
}

function EmergencyIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="7" /><path d="M10 6v5M10 14v.2" />
    </svg>
  )
}

function CaptureIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M3 6h3l1-2h6l1 2h3v10H3V6Z" /><circle cx="10" cy="11" r="3" />
    </svg>
  )
}
