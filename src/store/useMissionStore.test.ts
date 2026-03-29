import { beforeEach, describe, expect, it } from 'vitest'
import type { FlightPatternMissionResult } from '../lib/flightPatterns'
import { useMissionStore } from './useMissionStore'

function createBoundary() {
  const store = useMissionStore.getState()

  store.enterSetup()
  store.startDrawing()
  store.addPoint(-40, -20)
  store.addPoint(40, -20)
  store.addPoint(0, 40)
  store.closePolygon()
}

function createGeneratedMission(): FlightPatternMissionResult {
  return {
    patternId: 'coverage',
    segments: [
      [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
      ],
    ],
    waypoints: [
      { id: 1, x: -10, y: -10, z: 50, actions: [], role: 'anchor' },
      { id: 2, x: 10, y: -10, z: 50, actions: [], role: 'anchor' },
    ],
    anchorWaypoints: [
      { id: 1, x: -10, y: -10, z: 50, actions: [], role: 'anchor' },
      { id: 2, x: 10, y: -10, z: 50, actions: [], role: 'anchor' },
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
      direction: 'north',
    },
  }
}

describe('useMissionStore exclusion zone foundation', () => {
  beforeEach(() => {
    useMissionStore.getState().resetMission()
  })

  it('creates a draft exclusion zone and switches drawing target', () => {
    createBoundary()

    const zoneId = useMissionStore.getState().addExclusionZone()
    const state = useMissionStore.getState()

    expect(zoneId).toBe(1)
    expect(state.stage).toBe('drawing')
    expect(state.drawingTarget).toBe('exclusion')
    expect(state.activeExclusionZoneId).toBe(1)
    expect(state.exclusionZones).toHaveLength(1)
    expect(state.exclusionZones[0]).toMatchObject({
      id: 1,
      label: 'Excluded area 1',
      enabled: true,
    })
  })

  it('routes addPoint and closePolygon through the active exclusion zone', () => {
    createBoundary()

    const zoneId = useMissionStore.getState().addExclusionZone()

    if (zoneId === null) {
      throw new Error('Expected exclusion zone to be created')
    }

    const store = useMissionStore.getState()
    store.addPoint(-10, -10)
    store.addPoint(10, -10)
    store.addPoint(0, 10)
    store.closePolygon()

    const state = useMissionStore.getState()
    const zone = state.exclusionZones.find((entry) => entry.id === zoneId)

    expect(zone?.points).toHaveLength(3)
    expect(state.stage).toBe('editing')
    expect(state.drawingTarget).toBe('boundary')
    expect(state.activeExclusionZoneId).toBeNull()
    expect(state.points).toHaveLength(3)
  })

  it('cancels exclusion drawing by removing the draft zone and returning to editing', () => {
    createBoundary()

    const zoneId = useMissionStore.getState().addExclusionZone()

    if (zoneId === null) {
      throw new Error('Expected exclusion zone to be created')
    }

    const store = useMissionStore.getState()
    store.addPoint(-10, -10)
    store.addPoint(10, -10)
    store.cancelDrawing()

    const state = useMissionStore.getState()

    expect(state.stage).toBe('editing')
    expect(state.drawingTarget).toBe('boundary')
    expect(state.activeExclusionZoneId).toBeNull()
    expect(state.exclusionZones).toHaveLength(0)
  })

  it('preserves exclusion zones when redrawing the boundary', () => {
    createBoundary()

    const zoneId = useMissionStore.getState().addExclusionZone()

    if (zoneId === null) {
      throw new Error('Expected exclusion zone to be created')
    }

    const store = useMissionStore.getState()
    store.addPoint(-10, -10)
    store.addPoint(10, -10)
    store.addPoint(0, 10)
    store.closePolygon()
    store.redrawMission()

    const state = useMissionStore.getState()

    expect(state.stage).toBe('drawing')
    expect(state.drawingTarget).toBe('boundary')
    expect(state.points).toHaveLength(0)
    expect(state.exclusionZones).toHaveLength(1)
    expect(state.exclusionZones[0]?.id).toBe(zoneId)
  })

  it('stores a generated mission snapshot when generating a path', () => {
    createBoundary()

    const mission = createGeneratedMission()
    useMissionStore.getState().generatePath(mission, {
      mode: 'auto',
      targetCount: null,
      targetSpacing: null,
    })

    const state = useMissionStore.getState()

    expect(state.stage).toBe('generated')
    expect(state.generatedWaypointDensity).toEqual({
      mode: 'auto',
      targetCount: null,
      targetSpacing: null,
    })
    expect(state.generatedPatternId).toBe('coverage')
    expect(state.generatedPatternMeta).toEqual(mission.meta)
    expect(state.generatedSegments).toEqual(mission.segments)
    expect(state.generatedAnchorWaypoints).toEqual(mission.anchorWaypoints)
    expect(state.generatedPathSegments).toEqual(mission.pathSegments)
    expect(state.generatedClosed).toBe(false)
    expect(state.waypoints).toEqual(mission.waypoints)
  })

  it('returns to editing and clears generated snapshot when toggling an exclusion in generated stage', () => {
    createBoundary()

    const zoneId = useMissionStore.getState().addExclusionZone()

    if (zoneId === null) {
      throw new Error('Expected exclusion zone to be created')
    }

    const store = useMissionStore.getState()
    store.addPoint(-10, -10)
    store.addPoint(10, -10)
    store.addPoint(0, 10)
    store.closePolygon()
    store.generatePath(createGeneratedMission(), {
      mode: 'auto',
      targetCount: null,
      targetSpacing: null,
    })
    store.toggleExclusionZone(zoneId)

    const state = useMissionStore.getState()

    expect(state.stage).toBe('editing')
    expect(state.generatedPatternId).toBeNull()
    expect(state.generatedPatternMeta).toBeNull()
    expect(state.generatedSegments).toEqual([])
    expect(state.generatedAnchorWaypoints).toEqual([])
    expect(state.generatedPathSegments).toEqual([])
    expect(state.generatedWaypointDensity).toBeNull()
    expect(state.waypoints).toEqual([])
  })

  it('updates generated waypoint position while preserving selection and actions', () => {
    createBoundary()

    const mission = createGeneratedMission()
    mission.waypoints[0] = {
      ...mission.waypoints[0],
      actions: [{ id: 1, type: 'hover', config: { durationSec: 4 } }],
    }
    mission.anchorWaypoints[0] = {
      ...mission.anchorWaypoints[0],
      actions: [{ id: 1, type: 'hover', config: { durationSec: 4 } }],
    }

    const store = useMissionStore.getState()
    store.generatePath(mission, {
      mode: 'auto',
      targetCount: null,
      targetSpacing: null,
    })
    store.selectWaypoint(1)
    store.setStartWaypoint(1)
    store.updateWaypointPosition(1, { x: 500, y: -200, z: 999 })

    const state = useMissionStore.getState()

    expect(state.selectedWaypointId).toBe(1)
    expect(state.startWaypointId).toBe(1)
    expect(state.waypoints[0]).toMatchObject({
      id: 1,
      x: 120,
      y: -90,
      z: 200,
      actions: [{ id: 1, type: 'hover', config: { durationSec: 4 } }],
    })
    expect(state.generatedAnchorWaypoints[0]).toMatchObject({
      id: 1,
      x: 120,
      y: -90,
      z: 200,
    })
    expect(state.generatedPathSegments[0]).toMatchObject({
      fromAnchorId: 1,
      toAnchorId: 2,
    })
  })
})
