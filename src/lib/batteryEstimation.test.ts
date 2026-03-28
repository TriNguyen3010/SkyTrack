import { describe, expect, it } from 'vitest'
import { computeBatteryReport } from './batteryEstimation'
import { getDronePreset, getSafetyPreset } from './batteryPresets'
import type { MissionWaypoint } from '../store/useMissionStore'

function createWaypoint(
  id: number,
  x: number,
  y: number,
  z: number,
): MissionWaypoint {
  return {
    id,
    x,
    y,
    z,
    actions: [],
    role: 'anchor',
  }
}

describe('computeBatteryReport', () => {
  const droneProfile = getDronePreset('generic-quad-medium')
  const safetyPreset = getSafetyPreset('standard')

  it('accounts for home-to-first-waypoint horizontal travel in addition to takeoff', () => {
    const report = computeBatteryReport({
      droneProfile,
      safetyPreset,
      homePoint: { x: 0, y: 0, z: 0 },
      isClosedLoop: false,
      waypoints: [createWaypoint(1, 120, 0, 50)],
    })

    expect(report.takeoffEnergyMah).toBeGreaterThan(0)
    expect(report.waypointEstimates[0]?.travelDistanceM).toBeCloseTo(120, 5)
    expect(report.totalDistanceM).toBeCloseTo(120, 5)
  })

  it('adds the closing segment for closed-loop missions', () => {
    const waypoints = [
      createWaypoint(1, 0, 0, 50),
      createWaypoint(2, 100, 0, 50),
      createWaypoint(3, 100, 100, 50),
    ]

    const openReport = computeBatteryReport({
      droneProfile,
      safetyPreset,
      homePoint: { x: 0, y: 0, z: 0 },
      isClosedLoop: false,
      waypoints,
    })
    const closedReport = computeBatteryReport({
      droneProfile,
      safetyPreset,
      homePoint: { x: 0, y: 0, z: 0 },
      isClosedLoop: true,
      waypoints,
    })

    expect(closedReport.totalDistanceM).toBeGreaterThan(openReport.totalDistanceM)
    expect(closedReport.totalTravelEnergyMah).toBeGreaterThan(
      openReport.totalTravelEnergyMah,
    )
  })

  it('carries change_altitude forward into the next travel segment', () => {
    const baselineWaypoints = [
      createWaypoint(1, 0, 0, 50),
      createWaypoint(2, 0, 0, 50),
    ]
    const changedWaypoints: MissionWaypoint[] = [
      {
        ...createWaypoint(1, 0, 0, 50),
        actions: [
          {
            id: 1,
            type: 'change_altitude',
            config: { altitudeDelta: 20 },
          },
        ],
      },
      createWaypoint(2, 0, 0, 50),
    ]

    const baselineReport = computeBatteryReport({
      droneProfile,
      safetyPreset,
      homePoint: { x: 0, y: 0, z: 0 },
      isClosedLoop: false,
      waypoints: baselineWaypoints,
    })
    const changedReport = computeBatteryReport({
      droneProfile,
      safetyPreset,
      homePoint: { x: 0, y: 0, z: 0 },
      isClosedLoop: false,
      waypoints: changedWaypoints,
    })

    expect(changedReport.totalTravelEnergyMah).toBeGreaterThan(
      baselineReport.totalTravelEnergyMah,
    )
    expect(changedReport.waypointEstimates[0]?.actionCostMah).toBeGreaterThan(0)
  })

  it('flags infeasible missions when total required energy exceeds battery capacity', () => {
    const report = computeBatteryReport({
      droneProfile: {
        ...droneProfile,
        batteryCapacityMah: 200,
      },
      safetyPreset,
      homePoint: { x: 0, y: 0, z: 0 },
      isClosedLoop: false,
      waypoints: [
        createWaypoint(1, 0, 0, 50),
        createWaypoint(2, 600, 0, 50),
        createWaypoint(3, 1200, 0, 50),
      ],
    })

    expect(report.isFeasible).toBe(false)
    expect(report.warnings.some((warning) => warning.level === 'critical')).toBe(true)
    expect(report.pointOfNoReturn).not.toBeNull()
  })

  it('clamps negative altitude changes and emits a waypoint warning', () => {
    const report = computeBatteryReport({
      droneProfile,
      safetyPreset,
      homePoint: { x: 0, y: 0, z: 0 },
      isClosedLoop: false,
      waypoints: [
        {
          ...createWaypoint(1, 0, 0, 10),
          actions: [
            {
              id: 1,
              type: 'change_altitude',
              config: { altitudeDelta: -40 },
            },
          ],
        },
      ],
    })

    expect(report.warnings.some((warning) => warning.waypointId === 1)).toBe(true)
    expect(report.waypointEstimates[0]?.rthCostFromHereMah).toBeGreaterThanOrEqual(0)
  })
})
