import { describe, expect, it } from 'vitest'
import {
  deriveWaypointInteractionModel,
  getAllowedStartWaypointIds,
} from './waypointInteraction'
import type { MissionWaypoint } from '../store/useMissionStore'

function createWaypoint(
  id: number,
  role: MissionWaypoint['role'],
  x: number,
): MissionWaypoint {
  return {
    id,
    x,
    y: 0,
    z: 50,
    actions: [],
    role,
  }
}

describe('waypointInteraction', () => {
  it('allows only anchor waypoints as start nodes on closed routes', () => {
    const waypoints = [
      createWaypoint(1, 'anchor', 0),
      createWaypoint(2, 'intermediate', 5),
      createWaypoint(3, 'anchor', 10),
      createWaypoint(4, 'intermediate', 15),
    ]

    expect(getAllowedStartWaypointIds('perimeter', waypoints, true)).toEqual([1, 3])
  })

  it('falls back to auto start when an intermediate waypoint is requested', () => {
    const waypoints = [
      createWaypoint(1, 'anchor', 0),
      createWaypoint(2, 'intermediate', 5),
      createWaypoint(3, 'anchor', 10),
    ]

    const interactionModel = deriveWaypointInteractionModel({
      patternId: 'corridor',
      waypoints,
      requestedStartWaypointId: 2,
      isClosedLoopOverride: false,
    })

    expect(interactionModel.effectiveStartWaypointId).toBeNull()
    expect(interactionModel.didFallbackToAutoStart).toBe(true)
  })
})
