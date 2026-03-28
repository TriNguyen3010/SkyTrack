import { describe, expect, it } from 'vitest'
import type { MissionWaypoint } from '../store/useMissionStore'
import {
  applySegmentSpeedProfile,
  buildDroneSimulationPath,
  getDroneSimulationWaypointIndexAtProgress,
  getDroneSimulationWaypointProgress,
  normalizeDroneSimulationProgress,
  resolveDroneSimulationWaypoints,
  sampleDroneSimulationPath,
} from './droneSimulationPath'

function waypoint(
  id: number,
  x: number,
  y: number,
  z = 50,
  actions: MissionWaypoint['actions'] = [],
): MissionWaypoint {
  return {
    id,
    x,
    y,
    z,
    actions,
    role: 'anchor',
  }
}

describe('droneSimulationPath', () => {
  it('builds an open path and samples midpoint position', () => {
    const path = buildDroneSimulationPath({
      waypoints: [waypoint(1, 0, 0), waypoint(2, 100, 0)],
      isClosedLoop: false,
    })

    expect(path).not.toBeNull()
    expect(path?.segments).toHaveLength(1)
    expect(path?.totalLength).toBeCloseTo(100, 5)

    const sample = sampleDroneSimulationPath(path!, 0.5)

    expect(sample.position.x).toBeGreaterThan(30)
    expect(sample.position.x).toBeLessThan(70)
    expect(sample.position.z).toBeCloseTo(0, 5)
  })

  it('wraps progress for closed loop paths', () => {
    const path = buildDroneSimulationPath({
      waypoints: [waypoint(1, 0, 0), waypoint(2, 50, 0), waypoint(3, 50, 50)],
      isClosedLoop: true,
    })

    expect(path?.segments).toHaveLength(3)
    expect(normalizeDroneSimulationProgress(1.2, true)).toBeCloseTo(0.2, 5)

    const sample = sampleDroneSimulationPath(path!, 1.2)
    expect(sample.progress).toBeCloseTo(0.2, 5)
  })

  it('applies altitude deltas from change_altitude actions to following waypoints', () => {
    const resolved = resolveDroneSimulationWaypoints([
      waypoint(1, 0, 0, 50, [
        {
          id: 11,
          type: 'change_altitude',
          config: { altitudeDelta: 20 },
        },
      ]),
      waypoint(2, 40, 0, 50),
      waypoint(3, 80, 0, 50, [
        {
          id: 33,
          type: 'change_altitude',
          config: { altitudeDelta: -80 },
        },
      ]),
      waypoint(4, 120, 0, 50),
    ])

    expect(resolved.map((entry) => entry.z)).toEqual([50, 70, 70, 0])
  })

  it('tracks waypoint progress stops and current waypoint index', () => {
    const path = buildDroneSimulationPath({
      waypoints: [waypoint(1, 0, 0), waypoint(2, 100, 0), waypoint(3, 200, 0)],
      isClosedLoop: false,
    })

    expect(getDroneSimulationWaypointProgress(path!, 0)).toBe(0)
    expect(getDroneSimulationWaypointProgress(path!, 1)).toBeCloseTo(0.5, 5)
    expect(getDroneSimulationWaypointIndexAtProgress(path!, 0.75)).toBe(1)
  })

  it('uses stronger end easing for sharper turns', () => {
    const gentle = applySegmentSpeedProfile(0.9, 5)
    const sharp = applySegmentSpeedProfile(0.9, 90)

    expect(sharp).toBeLessThan(gentle)
  })
})
