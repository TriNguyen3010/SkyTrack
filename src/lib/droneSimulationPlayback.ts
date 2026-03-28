import {
  DRONE_SIMULATION_HOVER_LOOP_DURATION_RANGE_MS,
  DRONE_SIMULATION_ONE_SHOT_DURATION_RANGE_MS,
  DRONE_SIMULATION_PREVIEW_HOVER_LOOP_DURATION_RANGE_MS,
  DRONE_SIMULATION_PREVIEW_ONE_SHOT_DURATION_RANGE_MS,
} from './droneSimulationConstants'
import type { FlightPatternId } from './flightPatterns'
import type { MissionWaypoint } from '../store/useMissionStore'

export type DroneSimulationMode = 'loop' | 'one-shot'
export type DroneSimulationSource = 'preview' | 'generated'

export interface DroneSimulationSession {
  key: number
  source: DroneSimulationSource
  mode: DroneSimulationMode
  patternId: FlightPatternId
  waypoints: MissionWaypoint[]
  isClosedLoop: boolean
}

export type DroneSimulationCommand =
  | {
      token: number
      type: 'toggle-play'
    }
  | {
      token: number
      type: 'play'
    }
  | {
      token: number
      type: 'pause'
    }
  | {
      token: number
      type: 'stop'
    }
  | {
      token: number
      type: 'replay'
    }
  | {
      token: number
      type: 'seek-progress'
      progress: number
    }
  | {
      token: number
      type: 'seek-waypoint'
      direction: 'prev' | 'next'
    }

export type DroneSimulationCommandInput =
  | {
      type: 'toggle-play'
    }
  | {
      type: 'play'
    }
  | {
      type: 'pause'
    }
  | {
      type: 'stop'
    }
  | {
      type: 'replay'
    }
  | {
      type: 'seek-progress'
      progress: number
    }
  | {
      type: 'seek-waypoint'
      direction: 'prev' | 'next'
    }

export interface DroneSimulationTelemetry {
  visible: boolean
  mode: DroneSimulationMode | null
  source: DroneSimulationSource | null
  patternId: FlightPatternId | null
  isPlaying: boolean
  isCompleted: boolean
  progress: number
  currentWaypointIndex: number
  waypointCount: number
}

export const DRONE_SIMULATION_SPEED_OPTIONS = [0.5, 1, 2, 4] as const

export const DEFAULT_DRONE_SIMULATION_TELEMETRY: DroneSimulationTelemetry = {
  visible: false,
  mode: null,
  source: null,
  patternId: null,
  isPlaying: false,
  isCompleted: false,
  progress: 0,
  currentWaypointIndex: 0,
  waypointCount: 0,
}

export function getDroneSimulationDurationMs(
  totalPathLength: number,
  mode: DroneSimulationMode,
  source: DroneSimulationSource,
): number {
  const range =
    mode === 'loop'
      ? source === 'preview'
        ? DRONE_SIMULATION_PREVIEW_HOVER_LOOP_DURATION_RANGE_MS
        : DRONE_SIMULATION_HOVER_LOOP_DURATION_RANGE_MS
      : source === 'preview'
        ? DRONE_SIMULATION_PREVIEW_ONE_SHOT_DURATION_RANGE_MS
        : DRONE_SIMULATION_ONE_SHOT_DURATION_RANGE_MS
  const normalizedLength = Math.max(0, Math.min(totalPathLength, 600))
  const alpha = normalizedLength / 600
  return Math.round(range.min + (range.max - range.min) * alpha)
}

export function getNextDroneSimulationSpeed(
  currentSpeed: number,
): (typeof DRONE_SIMULATION_SPEED_OPTIONS)[number] {
  const currentIndex = DRONE_SIMULATION_SPEED_OPTIONS.findIndex(
    (entry) => entry === currentSpeed,
  )
  const nextIndex =
    currentIndex === -1
      ? 1
      : (currentIndex + 1) % DRONE_SIMULATION_SPEED_OPTIONS.length
  return DRONE_SIMULATION_SPEED_OPTIONS[nextIndex]
}
