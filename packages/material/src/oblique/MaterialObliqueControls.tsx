import AimOutlined from '@ant-design/icons/AimOutlined'
import FullscreenExitOutlined from '@ant-design/icons/FullscreenExitOutlined'
import RotateLeftOutlined from '@ant-design/icons/RotateLeftOutlined'
import RotateRightOutlined from '@ant-design/icons/RotateRightOutlined'
import ZoomInOutlined from '@ant-design/icons/ZoomInOutlined'
import ZoomOutOutlined from '@ant-design/icons/ZoomOutOutlined'

import type { MaterialObliqueObject } from './projection'
import {
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  type ObliqueCamera
} from './obliqueCamera'

interface MaterialObliqueControlsProps {
  objectCount: number
  rotationDeg: number
  camera: ObliqueCamera
  selectedObject?: MaterialObliqueObject
  onRotate: (deltaDeg: number) => void
  onZoom: (factor: number) => void
  onFitAll: () => void
  onFocus: (object?: MaterialObliqueObject) => void
}

const ROTATION_BUTTON_STEP_DEG = 15

/**
 * 展示物料（Material）2.5D 画布身份与相机快捷控制。
 *
 * @param props 当前相机、选择对象以及相机命令。
 * @returns 画布顶栏。
 */
export function MaterialObliqueControls({
  objectCount,
  rotationDeg,
  camera,
  selectedObject,
  onRotate,
  onZoom,
  onFitAll,
  onFocus
}: MaterialObliqueControlsProps): React.JSX.Element {
  return (
    <header className="material-oblique-canvas__header">
      <div className="material-oblique-canvas__identity">
        <strong>实验室 2.5D</strong>
        <span>{objectCount} 个对象</span>
      </div>
      <div
        className="material-oblique-canvas__camera"
        role="group"
        aria-label="2.5D 视图控制"
      >
        <button
          type="button"
          aria-label="向左旋转 2.5D 视图"
          title="向左旋转"
          onClick={() => onRotate(-ROTATION_BUTTON_STEP_DEG)}
        >
          <RotateLeftOutlined aria-hidden="true" />
        </button>
        <output aria-label="当前旋转角度">{Math.round(rotationDeg)}°</output>
        <button
          type="button"
          aria-label="向右旋转 2.5D 视图"
          title="向右旋转"
          onClick={() => onRotate(ROTATION_BUTTON_STEP_DEG)}
        >
          <RotateRightOutlined aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="缩小 2.5D 视图"
          disabled={camera.zoom <= MIN_CAMERA_ZOOM}
          title="缩小"
          onClick={() => onZoom(1 / 1.25)}
        >
          <ZoomOutOutlined aria-hidden="true" />
        </button>
        <output aria-label="当前缩放比例">
          {Math.round(camera.zoom * 100)}%
        </output>
        <button
          type="button"
          aria-label="放大 2.5D 视图"
          disabled={camera.zoom >= MAX_CAMERA_ZOOM}
          title="放大"
          onClick={() => onZoom(1.25)}
        >
          <ZoomInOutlined aria-hidden="true" />
        </button>
        <button type="button" aria-label="适应全部物料" title="适应全部" onClick={onFitAll}>
          <FullscreenExitOutlined aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="聚焦已选物料"
          disabled={!selectedObject}
          title="聚焦已选"
          onClick={() => onFocus(selectedObject)}
        >
          <AimOutlined aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
