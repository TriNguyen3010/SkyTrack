import { WORLD_BOUNDS } from './missionGeometry'
import type { MissionWaypoint } from '../store/useMissionStore'

export const WAYPOINT_DRAG_MIN_ALTITUDE = 5
export const WAYPOINT_DRAG_MAX_ALTITUDE = 200
export const WAYPOINT_STEM_HITBOX_MIN_HEIGHT = 15

export interface WaypointPositionPatch {
  x?: number
  y?: number
  z?: number
}

export function clampWaypointPositionPatch(
  patch: WaypointPositionPatch,
): WaypointPositionPatch {
  return {
    x:
      patch.x === undefined
        ? undefined
        : Math.min(WORLD_BOUNDS.maxX, Math.max(WORLD_BOUNDS.minX, patch.x)),
    y:
      patch.y === undefined
        ? undefined
        : Math.min(WORLD_BOUNDS.maxY, Math.max(WORLD_BOUNDS.minY, patch.y)),
    z:
      patch.z === undefined
        ? undefined
        : Math.min(
            WAYPOINT_DRAG_MAX_ALTITUDE,
            Math.max(WAYPOINT_DRAG_MIN_ALTITUDE, patch.z),
          ),
  }
}

export function applyWaypointPositionPatch(
  waypoint: MissionWaypoint,
  patch: WaypointPositionPatch,
): MissionWaypoint {
  const nextPatch = clampWaypointPositionPatch(patch)

  return {
    ...waypoint,
    x: nextPatch.x ?? waypoint.x,
    y: nextPatch.y ?? waypoint.y,
    z: nextPatch.z ?? waypoint.z,
  }
}

export function calculateWaypointZMetersPerPixel(cameraDistance: number): number {
  const clampedDistance = Math.min(340, Math.max(120, cameraDistance))
  return 0.15 + (clampedDistance - 120) * 0.00182
}

export function calculateWaypointStemHitboxRadius(
  cameraDistance: number,
  polarDeg: number,
): number {
  let radius =
    cameraDistance < 160 ? 2.5 : cameraDistance <= 260 ? 4 : 6

  if (polarDeg < 30) {
    radius *= 1.5
  }

  return radius
}

export function calculateWaypointStemHitboxHeight(
  altitude: number,
  markerLift: number,
  groundHeight: number,
): number {
  return Math.max(
    WAYPOINT_STEM_HITBOX_MIN_HEIGHT,
    altitude + markerLift - groundHeight,
  )
}

export function getWaypointDragClampState(
  altitude: number,
): 'none' | 'min' | 'max' {
  if (altitude <= WAYPOINT_DRAG_MIN_ALTITUDE) {
    return 'min'
  }

  if (altitude >= WAYPOINT_DRAG_MAX_ALTITUDE) {
    return 'max'
  }

  return 'none'
}
