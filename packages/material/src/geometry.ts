import type { LabPose, Vector3Tuple } from './types'

export type Matrix4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
]

export const IDENTITY_POSE: LabPose = Object.freeze({
  positionMm: Object.freeze([0, 0, 0]) as Vector3Tuple,
  rotationDegXYZ: Object.freeze([0, 0, 0]) as Vector3Tuple
})

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

export function poseToMatrix(pose: LabPose): Matrix4 {
  const [xDeg, yDeg, zDeg] = pose.rotationDegXYZ
  const x = xDeg * DEG_TO_RAD
  const y = yDeg * DEG_TO_RAD
  const z = zDeg * DEG_TO_RAD

  const cx = Math.cos(x)
  const sx = Math.sin(x)
  const cy = Math.cos(y)
  const sy = Math.sin(y)
  const cz = Math.cos(z)
  const sz = Math.sin(z)

  // Rz * Ry * Rx for an XYZ Euler authoring contract.
  const r00 = cz * cy
  const r01 = cz * sy * sx - sz * cx
  const r02 = cz * sy * cx + sz * sx
  const r10 = sz * cy
  const r11 = sz * sy * sx + cz * cx
  const r12 = sz * sy * cx - cz * sx
  const r20 = -sy
  const r21 = cy * sx
  const r22 = cy * cx
  const [tx, ty, tz] = pose.positionMm

  return [
    r00, r01, r02, tx,
    r10, r11, r12, ty,
    r20, r21, r22, tz,
    0, 0, 0, 1
  ]
}

export function multiplyMatrices(left: Matrix4, right: Matrix4): Matrix4 {
  const result = new Array<number>(16).fill(0)
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[row * 4 + column] +=
          left[row * 4 + index] * right[index * 4 + column]
      }
    }
  }
  return result as unknown as Matrix4
}

export function invertRigidMatrix(matrix: Matrix4): Matrix4 {
  const r00 = matrix[0]
  const r01 = matrix[1]
  const r02 = matrix[2]
  const r10 = matrix[4]
  const r11 = matrix[5]
  const r12 = matrix[6]
  const r20 = matrix[8]
  const r21 = matrix[9]
  const r22 = matrix[10]
  const tx = matrix[3]
  const ty = matrix[7]
  const tz = matrix[11]

  return [
    r00, r10, r20, -(r00 * tx + r10 * ty + r20 * tz),
    r01, r11, r21, -(r01 * tx + r11 * ty + r21 * tz),
    r02, r12, r22, -(r02 * tx + r12 * ty + r22 * tz),
    0, 0, 0, 1
  ]
}

export function transformPoint(
  matrix: Matrix4,
  point: Vector3Tuple
): Vector3Tuple {
  const [x, y, z] = point
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11]
  ]
}

export function matrixToPose(matrix: Matrix4): LabPose {
  const sy = Math.max(-1, Math.min(1, -matrix[8]))
  const y = Math.asin(sy)
  const cy = Math.cos(y)
  let x: number
  let z: number

  if (Math.abs(cy) > 1e-8) {
    x = Math.atan2(matrix[9], matrix[10])
    z = Math.atan2(matrix[4], matrix[0])
  } else {
    x = 0
    z = Math.atan2(-matrix[1], matrix[5])
  }

  return {
    positionMm: [matrix[3], matrix[7], matrix[11]],
    rotationDegXYZ: [
      normalizeDegrees(x * RAD_TO_DEG),
      normalizeDegrees(y * RAD_TO_DEG),
      normalizeDegrees(z * RAD_TO_DEG)
    ]
  }
}

export function composePoses(parent: LabPose, child: LabPose): LabPose {
  return matrixToPose(
    multiplyMatrices(poseToMatrix(parent), poseToMatrix(child))
  )
}

export function relativePose(world: LabPose, parentWorld: LabPose): LabPose {
  return matrixToPose(
    multiplyMatrices(invertRigidMatrix(poseToMatrix(parentWorld)), poseToMatrix(world))
  )
}

function normalizeDegrees(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180
  return Math.abs(normalized) < 1e-10 ? 0 : normalized
}
