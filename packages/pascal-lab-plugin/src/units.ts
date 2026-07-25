export const MILLIMETERS_TO_METERS = 0.001
export const METERS_TO_MILLIMETERS = 1000

export type Vector3Tuple = [number, number, number]

/** Cloud/ROS Z-up millimeters to Three.js Y-up meters. */
export function positionMmToThree(
  position: Vector3Tuple
): Vector3Tuple {
  return [
    position[0] * MILLIMETERS_TO_METERS,
    position[2] * MILLIMETERS_TO_METERS,
    position[1] * MILLIMETERS_TO_METERS
  ]
}

/** Three.js Y-up meters to Cloud/ROS Z-up millimeters. */
export function positionThreeToMm(
  position: Vector3Tuple
): Vector3Tuple {
  return [
    Math.round(position[0] * METERS_TO_MILLIMETERS),
    Math.round(position[2] * METERS_TO_MILLIMETERS),
    Math.round(position[1] * METERS_TO_MILLIMETERS)
  ]
}

/**
 * Keep the orientation used by the original Cloud Pascal bridge. The extra
 * half-turn matches legacy Lab3D model fronts.
 */
export function topLevelPoseToPascal(
  positionMm: Vector3Tuple,
  rotationRad: Vector3Tuple
): { position: Vector3Tuple; rotation: Vector3Tuple } {
  const position = positionMmToThree(positionMm)
  return {
    position: [-position[0], position[1], -position[2]],
    rotation: [
      rotationRad[0],
      rotationRad[2] + Math.PI,
      rotationRad[1]
    ]
  }
}

export function pascalPoseToTopLevel(
  position: Vector3Tuple,
  rotation: Vector3Tuple
): { position: Vector3Tuple; rotation: Vector3Tuple } {
  return {
    position: [
      Math.round(-position[0] * METERS_TO_MILLIMETERS),
      Math.round(-position[2] * METERS_TO_MILLIMETERS),
      Math.round(position[1] * METERS_TO_MILLIMETERS)
    ],
    rotation: [
      rotation[0],
      rotation[2],
      rotation[1] - Math.PI
    ]
  }
}

export function mountedPoseToPascal(
  positionMm: Vector3Tuple,
  rotationRad: Vector3Tuple
): { position: Vector3Tuple; rotation: Vector3Tuple } {
  return {
    position: positionMmToThree(positionMm),
    rotation: rotationRad
  }
}

export function pascalPoseToMounted(
  position: Vector3Tuple,
  rotation: Vector3Tuple
): { position: Vector3Tuple; rotation: Vector3Tuple } {
  return {
    position: positionThreeToMm(position),
    rotation
  }
}
