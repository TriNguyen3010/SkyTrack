import {
  DRONE_SIMULATION_ACTION_PAUSE_CAP_MS,
} from './droneSimulationConstants'
import type { MissionWaypoint } from '../store/useMissionStore'
import type {
  MissionWaypointAction,
  MissionWaypointActionType,
} from './waypointActions'

export interface WaypointSimulationActionCue {
  type: MissionWaypointActionType
  durationMs: number
}

export function getWaypointSimulationActionCues(
  waypoint: MissionWaypoint,
): WaypointSimulationActionCue[] {
  return waypoint.actions.map((action) => ({
    type: action.type,
    durationMs: getWaypointActionSimulationDurationMs(action),
  }))
}

export function getWaypointSimulationPauseMs(waypoint: MissionWaypoint): number {
  const total = waypoint.actions.reduce(
    (sum, action) => sum + getWaypointActionSimulationDurationMs(action),
    0,
  )

  return Math.min(total, DRONE_SIMULATION_ACTION_PAUSE_CAP_MS)
}

export function getWaypointActionSimulationDurationMs(
  action: MissionWaypointAction,
): number {
  switch (action.type) {
    case 'hover':
      return Math.min(500, action.config.durationSec * 50)
    case 'take_photo':
      return action.config.burstCount * 150
    case 'record_video':
      return Math.min(800, action.config.durationSec * 80)
    case 'drop_payload':
      return 400
    case 'fire_suppress':
      return Math.min(600, action.config.durationSec * 75)
    case 'change_altitude':
      return 300
    case 'set_gimbal':
      return 200
    case 'trigger_sensor':
      return 300
  }
}
