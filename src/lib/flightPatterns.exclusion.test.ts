import { describe, expect, it } from 'vitest'
import type { ExclusionZone, MissionPoint } from '../store/useMissionStore'
import {
  buildFlightPatternMission,
  createInitialPatternParams,
} from './flightPatterns'
import { isPointInPolygon } from './exclusionGeometry'

function point(id: number, x: number, y: number): MissionPoint {
  return { id, x, y }
}

function exclusionZone(
  id: number,
  points: MissionPoint[],
  enabled = true,
): ExclusionZone {
  return {
    id,
    label: `Excluded area ${id}`,
    points,
    enabled,
  }
}

describe('flight pattern exclusions', () => {
  const boundary = [
    point(1, -40, -40),
    point(2, 40, -40),
    point(3, 40, 40),
    point(4, -40, 40),
  ]
  const centerZone = exclusionZone(1, [
    point(1, -8, -30),
    point(2, 8, -30),
    point(3, 8, 30),
    point(4, -8, 30),
  ])

  it('clips coverage segments around exclusion zones', () => {
    const mission = buildFlightPatternMission('coverage', {
      points: boundary,
      exclusionZones: [centerZone],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 10,
        orientation: 0,
      }),
    })

    expect(mission).not.toBeNull()
    expect(mission?.segments.length).toBeGreaterThan(8)
    expect(
      mission?.waypoints.some((waypoint) => waypoint.x > -8 && waypoint.x < 8),
    ).toBe(false)
  })

  it('clips corridor passes around exclusion zones', () => {
    const paramsByPattern = createInitialPatternParams({
      scanAltitude: 50,
      lineSpacing: 10,
      orientation: 0,
    })
    paramsByPattern.corridor = {
      ...paramsByPattern.corridor,
      passes: 3,
      passSpacing: 12,
    }

    const mission = buildFlightPatternMission('corridor', {
      points: boundary,
      exclusionZones: [centerZone],
      paramsByPattern,
    })

    expect(mission).not.toBeNull()
    expect(mission?.segments.length).toBeGreaterThan(3)
    expect(
      mission?.segments.some(
        ([start, end]) =>
          Math.min(start.x, end.x) < 0 &&
          Math.max(start.x, end.x) > 0 &&
          start.y === end.y,
      ),
    ).toBe(false)
  })

  it('filters orbit waypoints that fall inside exclusion zones', () => {
    const orbitExclusion = exclusionZone(2, [
      point(1, 10, -40),
      point(2, 40, -40),
      point(3, 40, 0),
      point(4, 10, 0),
    ])
    const mission = buildFlightPatternMission('orbit', {
      points: boundary,
      exclusionZones: [orbitExclusion],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 10,
        orientation: 0,
      }),
    })

    expect(mission).not.toBeNull()
    expect(mission?.waypoints.length).toBeGreaterThan(0)
    expect(
      mission?.waypoints.some((waypoint) =>
        isPointInPolygon(
          {
            x: waypoint.x,
            y: waypoint.y,
          },
          orbitExclusion.points,
        ),
      ),
    ).toBe(false)
  })

  it('filters spiral waypoints that land inside exclusion zones', () => {
    const mission = buildFlightPatternMission('spiral', {
      points: boundary,
      exclusionZones: [exclusionZone(3, [
        point(1, -12, -12),
        point(2, 12, -12),
        point(3, 12, 12),
        point(4, -12, 12),
      ])],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 10,
        orientation: 0,
      }),
    })

    expect(mission).not.toBeNull()
    expect(
      mission?.waypoints.some(
        (waypoint) => Math.abs(waypoint.x) < 12 && Math.abs(waypoint.y) < 12,
      ),
    ).toBe(false)
  })
})
