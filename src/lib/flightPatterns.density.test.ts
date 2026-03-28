import { describe, expect, it } from 'vitest'
import type { MissionPoint } from '../store/useMissionStore'
import {
  buildFlightPatternMission,
  createInitialPatternParams,
} from './flightPatterns'

function point(id: number, x: number, y: number): MissionPoint {
  return { id, x, y }
}

describe('flight pattern density integration', () => {
  const boundary = [
    point(1, -40, -40),
    point(2, 40, -40),
    point(3, 40, 40),
    point(4, -40, 40),
  ]

  it('adds intermediate waypoints to coverage routes in count mode', () => {
    const mission = buildFlightPatternMission('coverage', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 20,
        orientation: 0,
      }),
      waypointDensity: {
        mode: 'count',
        targetCount: 18,
        targetSpacing: null,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.anchorWaypoints.length).toBeLessThan(mission?.waypoints.length ?? 0)
    expect(mission?.waypoints.some((waypoint) => waypoint.role === 'intermediate')).toBe(
      true,
    )
  })

  it('keeps auto behavior for grid when density mode is auto', () => {
    const mission = buildFlightPatternMission('grid', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 20,
        orientation: 0,
      }),
      waypointDensity: {
        mode: 'auto',
        targetCount: null,
        targetSpacing: null,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.waypoints).toHaveLength(mission?.anchorWaypoints.length ?? 0)
    expect(mission?.waypoints.every((waypoint) => waypoint.role === 'anchor')).toBe(true)
  })

  it('adds perimeter intermediates on long edges in spacing mode', () => {
    const mission = buildFlightPatternMission('perimeter', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 20,
        orientation: 0,
      }),
      waypointDensity: {
        mode: 'spacing',
        targetCount: null,
        targetSpacing: 10,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.waypoints.length).toBeGreaterThan(mission?.anchorWaypoints.length ?? 0)
  })

  it('uses orbit waypointCount as anchor count and can add intermediates above it', () => {
    const paramsByPattern = createInitialPatternParams({
      scanAltitude: 50,
      lineSpacing: 20,
      orientation: 0,
    })
    paramsByPattern.orbit = {
      ...paramsByPattern.orbit,
      waypointCount: 12,
    }

    const mission = buildFlightPatternMission('orbit', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern,
      waypointDensity: {
        mode: 'count',
        targetCount: 20,
        targetSpacing: null,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.anchorWaypoints).toHaveLength(13)
    expect(mission?.waypoints.length).toBe(20)
  })

  it('maps spiral count mode into a denser sampled anchor route', () => {
    const mission = buildFlightPatternMission('spiral', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 20,
        orientation: 0,
      }),
      waypointDensity: {
        mode: 'count',
        targetCount: 30,
        targetSpacing: null,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.anchorWaypoints.length).toBeGreaterThanOrEqual(24)
    expect(mission?.waypoints).toHaveLength(mission?.anchorWaypoints.length ?? 0)
  })

  it('can reduce coverage route down to a smaller total waypoint count', () => {
    const mission = buildFlightPatternMission('coverage', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 20,
        orientation: 0,
      }),
      waypointDensity: {
        mode: 'count',
        targetCount: 5,
        targetSpacing: null,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.waypoints).toHaveLength(5)
    expect(mission?.waypoints.every((waypoint) => waypoint.role === 'anchor')).toBe(true)
  })

  it('keeps perimeter simplify above the closed-loop minimum floor', () => {
    const mission = buildFlightPatternMission('perimeter', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 20,
        orientation: 0,
      }),
      waypointDensity: {
        mode: 'count',
        targetCount: 3,
        targetSpacing: null,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.closed).toBe(true)
    expect(mission?.waypoints).toHaveLength(4)
  })

  it('keeps orbit simplify above the closed-loop minimum floor', () => {
    const mission = buildFlightPatternMission('orbit', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 20,
        orientation: 0,
      }),
      waypointDensity: {
        mode: 'count',
        targetCount: 4,
        targetSpacing: null,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.closed).toBe(true)
    expect(mission?.waypoints).toHaveLength(6)
  })

  it('caps densified missions at 200 waypoints', () => {
    const mission = buildFlightPatternMission('coverage', {
      points: boundary,
      exclusionZones: [],
      paramsByPattern: createInitialPatternParams({
        scanAltitude: 50,
        lineSpacing: 5,
        orientation: 0,
      }),
      waypointDensity: {
        mode: 'count',
        targetCount: 400,
        targetSpacing: null,
      },
    })

    expect(mission).not.toBeNull()
    expect(mission?.waypoints.length).toBeLessThanOrEqual(200)
  })
})
