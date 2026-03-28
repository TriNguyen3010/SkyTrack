import { describe, expect, it } from 'vitest'
import type { MissionWaypoint } from '../store/useMissionStore'
import type { MissionWaypointAction } from './waypointActions'
import {
  canSetStartWaypoint,
  deriveWaypointInteractionModel,
  getAllowedStartWaypointIds,
  getMissionEndWaypointId,
  getOrderedMissionWaypoints,
  getWaypointValidationWarnings,
  isBulkAssignActive,
} from './waypointInteraction'

function createAction(
  action: MissionWaypointAction,
): MissionWaypointAction {
  return action
}

function waypoint(
  id: number,
  role: MissionWaypoint['role'] = 'anchor',
  actions: MissionWaypointAction[] = [],
): MissionWaypoint {
  return {
    id,
    x: id * 10,
    y: id * 5,
    z: 50,
    actions,
    role,
  }
}

describe('waypointInteraction', () => {
  it('limits open-path start nodes to endpoints', () => {
    const waypoints = [waypoint(1), waypoint(2), waypoint(3), waypoint(4)]

    expect(getAllowedStartWaypointIds('coverage', waypoints)).toEqual([1, 4])
    expect(canSetStartWaypoint('coverage', 2, waypoints)).toBe(false)
    expect(canSetStartWaypoint('coverage', 4, waypoints)).toBe(true)
  })

  it('allows any anchor on closed-loop patterns', () => {
    const waypoints = [waypoint(1), waypoint(2), waypoint(3), waypoint(4)]

    expect(getAllowedStartWaypointIds('perimeter', waypoints, true)).toEqual([1, 2, 3, 4])
    expect(canSetStartWaypoint('orbit', 3, waypoints, true)).toBe(true)
  })

  it('rotates ordered waypoints for closed loops', () => {
    const waypoints = [waypoint(1), waypoint(2), waypoint(3), waypoint(4)]

    const ordered = getOrderedMissionWaypoints('perimeter', waypoints, 3, true)

    expect(ordered.map((entry) => entry.id)).toEqual([3, 4, 1, 2])
    expect(getMissionEndWaypointId('perimeter', ordered, true)).toBe(3)
  })

  it('reverses open paths when selecting the tail endpoint as start', () => {
    const waypoints = [waypoint(1), waypoint(2), waypoint(3), waypoint(4)]

    const ordered = getOrderedMissionWaypoints('coverage', waypoints, 4, false)

    expect(ordered.map((entry) => entry.id)).toEqual([4, 3, 2, 1])
    expect(getMissionEndWaypointId('coverage', ordered, false)).toBe(1)
  })

  it('falls back to auto start when requested start becomes invalid', () => {
    const waypoints = [waypoint(1), waypoint(2), waypoint(3)]

    const model = deriveWaypointInteractionModel({
      patternId: 'coverage',
      waypoints,
      requestedStartWaypointId: 2,
      isClosedLoopOverride: false,
    })

    expect(model.effectiveStartWaypointId).toBeNull()
    expect(model.didFallbackToAutoStart).toBe(true)
    expect(model.orderedWaypoints.map((entry) => entry.id)).toEqual([1, 2, 3])
  })

  it('warns about intermediate actions, duplicate configs, payload drop, and unsafe altitude', () => {
    const warnings = getWaypointValidationWarnings({
      waypoint: waypoint(2, 'intermediate', [
        createAction({
          id: 1,
          type: 'drop_payload',
          config: { payloadType: 'medkit' },
        }),
        createAction({
          id: 2,
          type: 'hover',
          config: { durationSec: 40 },
        }),
        createAction({
          id: 3,
          type: 'hover',
          config: { durationSec: 40 },
        }),
        createAction({
          id: 4,
          type: 'change_altitude',
          config: { altitudeDelta: -60 },
        }),
      ]),
      effectiveStartWaypointId: 2,
      missionEndWaypointId: 3,
    })

    expect(warnings).toContain(
      'Intermediate waypoint actions may be cleared when waypoint density changes.',
    )
    expect(warnings).toContain('Duplicate action detected - consider merging identical steps.')
    expect(warnings).toContain('Payload drop mid-flight - confirm intentional.')
    expect(warnings).toContain('Altitude out of safe range.')
    expect(warnings).toContain('Dangerously low altitude at mission start.')
  })

  it('exposes bulk assign state as active only when an action type is set', () => {
    expect(isBulkAssignActive(null)).toBe(false)
    expect(isBulkAssignActive('take_photo')).toBe(true)
  })
})
