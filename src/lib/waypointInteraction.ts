import type { FlightPatternId } from './flightPatterns'
import type {
  MissionWaypoint,
} from '../store/useMissionStore'
import type {
  MissionWaypointActionType,
} from './waypointActions'

export type StartWaypointPolicy =
  | 'closed-rotatable'
  | 'open-endpoints-only'

export interface WaypointInteractionModel {
  policy: StartWaypointPolicy
  isClosedLoop: boolean
  allowedStartWaypointIds: number[]
  requestedStartWaypointId: number | null
  effectiveStartWaypointId: number | null
  orderedWaypoints: MissionWaypoint[]
  endWaypointId: number | null
  didFallbackToAutoStart: boolean
}

export function getStartWaypointPolicy(
  patternId: FlightPatternId,
): StartWaypointPolicy {
  switch (patternId) {
    case 'perimeter':
    case 'orbit':
      return 'closed-rotatable'
    case 'coverage':
    case 'spiral':
    case 'grid':
    case 'corridor':
      return 'open-endpoints-only'
  }
}

export function deriveWaypointInteractionModel({
  patternId,
  waypoints,
  requestedStartWaypointId,
}: {
  patternId: FlightPatternId
  waypoints: MissionWaypoint[]
  requestedStartWaypointId: number | null
}): WaypointInteractionModel {
  const policy = getStartWaypointPolicy(patternId)
  const allowedStartWaypointIds = getAllowedStartWaypointIds(patternId, waypoints)
  const canUseRequestedStart =
    requestedStartWaypointId !== null &&
    allowedStartWaypointIds.includes(requestedStartWaypointId)
  const effectiveStartWaypointId = canUseRequestedStart
    ? requestedStartWaypointId
    : null
  const orderedWaypoints = getOrderedMissionWaypoints(
    patternId,
    waypoints,
    effectiveStartWaypointId,
  )
  const isClosedLoop = policy === 'closed-rotatable'
  const endWaypointId = getMissionEndWaypointId(patternId, orderedWaypoints)

  return {
    policy,
    isClosedLoop,
    allowedStartWaypointIds,
    requestedStartWaypointId,
    effectiveStartWaypointId,
    orderedWaypoints,
    endWaypointId,
    didFallbackToAutoStart:
      requestedStartWaypointId !== null && !canUseRequestedStart,
  }
}

export function getAllowedStartWaypointIds(
  patternId: FlightPatternId,
  waypoints: MissionWaypoint[],
): number[] {
  if (waypoints.length === 0) {
    return []
  }

  if (waypoints.length === 1) {
    return [waypoints[0].id]
  }

  if (getStartWaypointPolicy(patternId) === 'closed-rotatable') {
    return waypoints.map((waypoint) => waypoint.id)
  }

  return [waypoints[0].id, waypoints[waypoints.length - 1].id]
}

export function canSetStartWaypoint(
  patternId: FlightPatternId,
  waypointId: number,
  waypoints: MissionWaypoint[],
): boolean {
  return getAllowedStartWaypointIds(patternId, waypoints).includes(waypointId)
}

export function getOrderedMissionWaypoints(
  patternId: FlightPatternId,
  waypoints: MissionWaypoint[],
  startWaypointId: number | null,
): MissionWaypoint[] {
  if (waypoints.length <= 1 || startWaypointId === null) {
    return [...waypoints]
  }

  const startIndex = waypoints.findIndex(
    (waypoint) => waypoint.id === startWaypointId,
  )

  if (startIndex === -1) {
    return [...waypoints]
  }

  if (getStartWaypointPolicy(patternId) === 'closed-rotatable') {
    return [...waypoints.slice(startIndex), ...waypoints.slice(0, startIndex)]
  }

  if (startIndex === waypoints.length - 1) {
    return [...waypoints].reverse()
  }

  return [...waypoints]
}

export function getMissionEndWaypointId(
  patternId: FlightPatternId,
  orderedWaypoints: MissionWaypoint[],
): number | null {
  if (orderedWaypoints.length === 0) {
    return null
  }

  if (orderedWaypoints.length === 1) {
    return orderedWaypoints[0].id
  }

  if (getStartWaypointPolicy(patternId) === 'closed-rotatable') {
    return orderedWaypoints[0].id
  }

  return orderedWaypoints[orderedWaypoints.length - 1]?.id ?? null
}

export function getWaypointValidationWarnings({
  waypoint,
  effectiveStartWaypointId,
  missionEndWaypointId,
}: {
  waypoint: MissionWaypoint
  effectiveStartWaypointId: number | null
  missionEndWaypointId?: number | null
}): string[] {
  const warnings: string[] = []
  const totalActionDuration = waypoint.actions.reduce((total, action) => {
    if (
      action.type === 'hover' ||
      action.type === 'record_video' ||
      action.type === 'fire_suppress'
    ) {
      return total + action.config.durationSec
    }

    return total
  }, 0)

  if (totalActionDuration > 60) {
    warnings.push('Long dwell time at this waypoint - verify battery budget.')
  }

  const hasDuplicateAction = waypoint.actions.some((action, index) =>
    waypoint.actions.findIndex(
      (candidate) =>
        candidate.type === action.type &&
        JSON.stringify(candidate.config) === JSON.stringify(action.config),
    ) !== index,
  )

  if (hasDuplicateAction) {
    warnings.push('Duplicate action detected - consider merging identical steps.')
  }

  const hasUnsafeAltitudeAction = waypoint.actions.some((action) => {
    if (action.type !== 'change_altitude') {
      return false
    }

    const nextAltitude = waypoint.z + action.config.altitudeDelta
    return nextAltitude < 0 || nextAltitude > 200
  })

  if (hasUnsafeAltitudeAction) {
    warnings.push('Altitude out of safe range.')
  }

  const hasMidFlightPayloadDrop =
    waypoint.actions.some((action) => action.type === 'drop_payload') &&
    missionEndWaypointId !== undefined &&
    missionEndWaypointId !== null &&
    waypoint.id !== missionEndWaypointId

  if (hasMidFlightPayloadDrop) {
    warnings.push('Payload drop mid-flight - confirm intentional.')
  }

  const startAltitudeWarning = getStartAltitudeWarning(
    waypoint,
    effectiveStartWaypointId,
  )

  if (startAltitudeWarning) {
    warnings.push(startAltitudeWarning)
  }

  return warnings
}

export function isBulkAssignActive(
  bulkAssignActionType: MissionWaypointActionType | null,
): boolean {
  return bulkAssignActionType !== null
}

function getStartAltitudeWarning(
  waypoint: MissionWaypoint,
  effectiveStartWaypointId: number | null,
): string | null {
  if (effectiveStartWaypointId !== waypoint.id) {
    return null
  }

  const changeAltitudeAction = waypoint.actions.find(
    (action) => action.type === 'change_altitude',
  )

  if (!changeAltitudeAction) {
    return null
  }

  const nextAltitude = waypoint.z + changeAltitudeAction.config.altitudeDelta

  if (nextAltitude < 5) {
    return 'Dangerously low altitude at mission start.'
  }

  return 'Altitude change at start - drone will adjust immediately after reaching start position.'
}
