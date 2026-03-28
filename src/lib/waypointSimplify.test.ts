import { describe, expect, it } from 'vitest'
import type { MissionWaypoint } from '../store/useMissionStore'
import {
  findToleranceForTargetCount,
  rdpSimplifyAnchors,
  simplifyAnchorsToTargetCount,
} from './waypointSimplify'

function anchor(
  id: number,
  x: number,
  y: number,
  actionCount = 0,
): MissionWaypoint {
  return {
    id,
    x,
    y,
    z: 50,
    actions: Array.from({ length: actionCount }, (_value, index) => ({
      id: index + 1,
      type: 'take_photo' as const,
      config: {
        burstCount: 1,
      },
    })),
    role: 'anchor',
  }
}

describe('waypointSimplify', () => {
  it('removes collinear anchors in open paths', () => {
    const anchors = [
      anchor(1, 0, 0),
      anchor(2, 10, 0),
      anchor(3, 20, 0),
      anchor(4, 30, 0),
    ]

    const simplified = rdpSimplifyAnchors(anchors, 0.01)

    expect(simplified.map((waypoint) => waypoint.id)).toEqual([1, 4])
  })

  it('preserves actioned anchors when protectActioned is enabled', () => {
    const anchors = [
      anchor(1, 0, 0),
      anchor(2, 10, 0, 1),
      anchor(3, 20, 0),
      anchor(4, 30, 0),
    ]

    const simplified = simplifyAnchorsToTargetCount(anchors, 2, {
      protectActioned: true,
    })

    expect(simplified.map((waypoint) => waypoint.id)).toEqual([1, 2, 4])
  })

  it('finds a tolerance that reaches the requested target count', () => {
    const anchors = [
      anchor(1, 0, 0),
      anchor(2, 10, 2),
      anchor(3, 20, 0),
      anchor(4, 30, 3),
      anchor(5, 40, 0),
    ]

    const tolerance = findToleranceForTargetCount(anchors, 3)
    const simplified = rdpSimplifyAnchors(anchors, tolerance)

    expect(simplified.length).toBeLessThanOrEqual(3)
    expect(simplified[0]?.id).toBe(1)
    expect(simplified[simplified.length - 1]?.id).toBe(5)
  })

  it('keeps closed loops above the configured minimum', () => {
    const anchors = [
      anchor(1, 0, 0),
      anchor(2, 10, 0),
      anchor(3, 10, 10),
      anchor(4, 0, 10),
      anchor(5, -4, 5),
    ]

    const simplified = simplifyAnchorsToTargetCount(anchors, 2, {
      closed: true,
      minimumWaypointCount: 4,
    })

    expect(simplified.length).toBeGreaterThanOrEqual(4)
  })
})
