import { describe, expect, it } from 'vitest'
import {
  buildPathSegmentsFromAnchors,
  computeWaypointDensityMetrics,
  resamplePath,
} from './waypointDensity'
import {
  DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS,
  DEFAULT_WAYPOINT_DENSITY_CONFIG,
} from './waypointDensityModels'
import type { MissionWaypoint } from '../store/useMissionStore'

function anchor(id: number, x: number, y: number, z = 50): MissionWaypoint {
  return {
    id,
    x,
    y,
    z,
    actions: [],
    role: 'anchor',
  }
}

describe('waypointDensity', () => {
  it('builds path segments between consecutive anchors', () => {
    const anchors = [anchor(1, 0, 0), anchor(2, 30, 0), anchor(3, 30, 40)]

    const segments = buildPathSegmentsFromAnchors(anchors)

    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({
      fromAnchorId: 1,
      toAnchorId: 2,
      length: 30,
    })
    expect(segments[1]).toMatchObject({
      fromAnchorId: 2,
      toAnchorId: 3,
      length: 40,
    })
  })

  it('keeps anchor-only output in auto mode', () => {
    const anchors = [anchor(1, 0, 0), anchor(2, 30, 0)]
    const pathSegments = buildPathSegmentsFromAnchors(anchors)

    const waypoints = resamplePath({
      anchors,
      pathSegments,
      config: DEFAULT_WAYPOINT_DENSITY_CONFIG,
      constraints: DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS,
    })

    expect(waypoints).toHaveLength(2)
    expect(waypoints.every((waypoint) => waypoint.role === 'anchor')).toBe(true)
  })

  it('adds intermediate waypoints in spacing mode', () => {
    const anchors = [anchor(1, 0, 0), anchor(2, 80, 0)]
    const pathSegments = buildPathSegmentsFromAnchors(anchors)

    const waypoints = resamplePath({
      anchors,
      pathSegments,
      config: {
        mode: 'spacing',
        targetCount: null,
        targetSpacing: 15,
      },
      constraints: DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS,
    })

    expect(waypoints).toHaveLength(6)
    expect(waypoints[1]?.role).toBe('intermediate')
    expect(waypoints[4]?.role).toBe('intermediate')
  })

  it('distributes exact intermediate count in count mode', () => {
    const anchors = [anchor(1, 0, 0), anchor(2, 50, 0), anchor(3, 90, 0)]
    const pathSegments = buildPathSegmentsFromAnchors(anchors)

    const waypoints = resamplePath({
      anchors,
      pathSegments,
      config: {
        mode: 'count',
        targetCount: 8,
        targetSpacing: null,
      },
      constraints: DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS,
    })

    expect(waypoints).toHaveLength(8)
    expect(waypoints.filter((waypoint) => waypoint.role === 'intermediate')).toHaveLength(5)
  })

  it('falls back to the configured minimum count floor when simplifying', () => {
    const anchors = [anchor(1, 0, 0), anchor(2, 20, 0), anchor(3, 40, 0)]
    const pathSegments = buildPathSegmentsFromAnchors(anchors)

    const waypoints = resamplePath({
      anchors,
      pathSegments,
      config: {
        mode: 'count',
        targetCount: 2,
        targetSpacing: null,
      },
      constraints: {
        ...DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS,
        minimumWaypointCount: 2,
      },
    })

    expect(waypoints).toHaveLength(2)
    expect(waypoints.every((waypoint) => waypoint.role === 'anchor')).toBe(true)
  })

  it('switches count mode into simplify behavior below anchor count', () => {
    const anchors = [
      anchor(1, 0, 0),
      anchor(2, 10, 0),
      anchor(3, 20, 0),
      anchor(4, 30, 0),
      anchor(5, 40, 0),
    ]
    const pathSegments = buildPathSegmentsFromAnchors(anchors)

    const waypoints = resamplePath({
      anchors,
      pathSegments,
      config: {
        mode: 'count',
        targetCount: 3,
        targetSpacing: null,
      },
      constraints: {
        ...DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS,
        minimumWaypointCount: 3,
      },
    })

    expect(waypoints).toHaveLength(3)
    expect(waypoints.every((waypoint) => waypoint.role === 'anchor')).toBe(true)
  })

  it('computes summary metrics from anchor and final waypoint arrays', () => {
    const anchors = [anchor(1, 0, 0), anchor(2, 40, 0)]
    const pathSegments = buildPathSegmentsFromAnchors(anchors)
    const waypoints = resamplePath({
      anchors,
      pathSegments,
      config: {
        mode: 'spacing',
        targetCount: null,
        targetSpacing: 10,
      },
      constraints: DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS,
    })

    const metrics = computeWaypointDensityMetrics({
      anchors,
      waypoints,
      pathSegments,
      constraints: DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS,
    })

    expect(metrics).toMatchObject({
      anchorCount: 2,
      intermediateCount: 3,
      totalCount: 5,
      totalPathLength: 40,
      effectiveSpacing: 10,
      minimumCount: 2,
    })
  })
})
