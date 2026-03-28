import { describe, expect, it } from 'vitest'
import type { FlightPatternMissionResult } from './flightPatterns'
import {
  countIntermediateWaypointActions,
  migrateAnchorActionsToDensityMission,
} from './waypointDensityMigration'
import type { MissionWaypoint } from '../store/useMissionStore'

function createWaypoint(
  id: number,
  role: MissionWaypoint['role'],
  x: number,
  y: number,
  actionCount = 0,
): MissionWaypoint {
  return {
    id,
    x,
    y,
    z: 50,
    role,
    actions: Array.from({ length: actionCount }, (_, index) => ({
      id: index + 1,
      type: 'hover' as const,
      config: {
        durationSec: 6 + index,
      },
    })),
  }
}

describe('waypointDensityMigration', () => {
  it('counts only intermediate waypoint actions', () => {
    const waypoints = [
      createWaypoint(1, 'anchor', 0, 0, 1),
      createWaypoint(2, 'intermediate', 10, 0, 2),
      createWaypoint(3, 'anchor', 20, 0, 3),
    ]

    expect(countIntermediateWaypointActions(waypoints)).toBe(2)
  })

  it('migrates anchor actions and clears intermediate actions', () => {
    const previousWaypoints = [
      createWaypoint(1, 'anchor', 0, 0, 1),
      createWaypoint(2, 'intermediate', 10, 0, 2),
      createWaypoint(3, 'anchor', 20, 0, 1),
    ]

    const nextMission: FlightPatternMissionResult = {
      patternId: 'coverage',
      segments: [
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
      ],
      waypoints: [
        createWaypoint(1, 'anchor', 0, 0, 0),
        createWaypoint(2, 'intermediate', 5, 0, 0),
        createWaypoint(3, 'intermediate', 10, 0, 0),
        createWaypoint(4, 'intermediate', 15, 0, 0),
        createWaypoint(5, 'anchor', 20, 0, 0),
      ],
      anchorWaypoints: [
        createWaypoint(1, 'anchor', 0, 0, 0),
        createWaypoint(2, 'anchor', 20, 0, 0),
      ],
      pathSegments: [
        {
          fromAnchorId: 1,
          toAnchorId: 2,
          length: 20,
          direction: { x: 1, y: 0 },
        },
      ],
      closed: false,
      meta: {
        estimatedLength: 20,
        loops: 1,
        direction: null,
      },
    }

    const migratedMission = migrateAnchorActionsToDensityMission(
      previousWaypoints,
      nextMission,
    )

    expect(migratedMission.waypoints[0]?.actions).toHaveLength(1)
    expect(migratedMission.waypoints[1]?.actions).toHaveLength(0)
    expect(migratedMission.waypoints[2]?.actions).toHaveLength(0)
    expect(migratedMission.waypoints[4]?.actions).toHaveLength(1)
    expect(migratedMission.anchorWaypoints[0]?.actions).toHaveLength(1)
    expect(migratedMission.anchorWaypoints[1]?.actions).toHaveLength(1)
  })
})
