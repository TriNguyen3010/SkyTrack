import type { FlightPatternMissionResult } from './flightPatterns'
import type { MissionWaypoint } from '../store/useMissionStore'
import { cloneWaypointAction } from './waypointActions'

const ANCHOR_MATCH_TOLERANCE = 0.35

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function getWaypointKey(waypoint: Pick<MissionWaypoint, 'x' | 'y' | 'z'>): string {
  return `${round3(waypoint.x)}:${round3(waypoint.y)}:${round3(waypoint.z)}`
}

function getDistance(
  left: Pick<MissionWaypoint, 'x' | 'y' | 'z'>,
  right: Pick<MissionWaypoint, 'x' | 'y' | 'z'>,
): number {
  const dx = left.x - right.x
  const dy = left.y - right.y
  const dz = left.z - right.z

  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function cloneWaypointActions(waypoint: MissionWaypoint) {
  return waypoint.actions.map((action) => cloneWaypointAction(action, action.id))
}

function buildAnchorActionMap(
  previousWaypoints: MissionWaypoint[],
  nextAnchors: MissionWaypoint[],
): Map<string, MissionWaypoint['actions']> {
  const previousAnchors = previousWaypoints.filter(
    (waypoint) => waypoint.role === 'anchor' && waypoint.actions.length > 0,
  )
  const consumedPreviousAnchorIds = new Set<number>()
  const nextAnchorActionMap = new Map<string, MissionWaypoint['actions']>()

  nextAnchors.forEach((nextAnchor) => {
    let bestMatchIndex = -1
    let bestDistance = Number.POSITIVE_INFINITY

    previousAnchors.forEach((previousAnchor, index) => {
      if (consumedPreviousAnchorIds.has(previousAnchor.id)) {
        return
      }

      const distance = getDistance(previousAnchor, nextAnchor)

      if (distance > ANCHOR_MATCH_TOLERANCE || distance >= bestDistance) {
        return
      }

      bestMatchIndex = index
      bestDistance = distance
    })

    if (bestMatchIndex === -1) {
      nextAnchorActionMap.set(getWaypointKey(nextAnchor), [])
      return
    }

    const matchedAnchor = previousAnchors[bestMatchIndex]

    if (!matchedAnchor) {
      nextAnchorActionMap.set(getWaypointKey(nextAnchor), [])
      return
    }

    consumedPreviousAnchorIds.add(matchedAnchor.id)
    nextAnchorActionMap.set(getWaypointKey(nextAnchor), cloneWaypointActions(matchedAnchor))
  })

  return nextAnchorActionMap
}

export function countIntermediateWaypointActions(waypoints: MissionWaypoint[]): number {
  return waypoints.reduce(
    (total, waypoint) =>
      waypoint.role === 'intermediate' ? total + waypoint.actions.length : total,
    0,
  )
}

export function migrateAnchorActionsToDensityMission(
  previousWaypoints: MissionWaypoint[],
  nextMission: FlightPatternMissionResult,
): FlightPatternMissionResult {
  const anchorActionMap = buildAnchorActionMap(
    previousWaypoints,
    nextMission.anchorWaypoints,
  )

  const applyAnchorActions = (waypoint: MissionWaypoint): MissionWaypoint => {
    if (waypoint.role !== 'anchor') {
      return {
        ...waypoint,
        actions: [],
      }
    }

    return {
      ...waypoint,
      actions: anchorActionMap.get(getWaypointKey(waypoint)) ?? [],
    }
  }

  return {
    ...nextMission,
    anchorWaypoints: nextMission.anchorWaypoints.map((waypoint) => ({
      ...waypoint,
      actions: anchorActionMap.get(getWaypointKey(waypoint)) ?? [],
    })),
    waypoints: nextMission.waypoints.map(applyAnchorActions),
  }
}
