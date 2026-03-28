import { describe, expect, it } from 'vitest'
import { generateBatteryRecommendations } from './batteryRecommendations'
import type { MissionBatteryReport } from './batteryModels'
import { getDronePreset } from './batteryPresets'

function createBaseReport(
  overrides: Partial<MissionBatteryReport> = {},
): MissionBatteryReport {
  return {
    droneProfile: getDronePreset('generic-quad-medium'),
    homePoint: { x: 0, y: 0, z: 0 },
    isClosedLoop: false,
    totalDistanceM: 1000,
    totalFlightTimeSec: 600,
    totalActionTimeSec: 60,
    totalMissionTimeSec: 660,
    totalEnergyMah: 1000,
    totalTravelEnergyMah: 800,
    totalActionEnergyMah: 200,
    takeoffEnergyMah: 50,
    landingEnergyMah: 80,
    availableBatteryMah: 5000,
    totalRequiredMah: 1400,
    batteryUsedPercent: 28,
    batteryRemainingPercent: 72,
    isFeasible: true,
    feasibilityMessage: 'Mission is feasible.',
    rthReserveMah: 120,
    safetyMarginMah: 600,
    pointOfNoReturn: null,
    waypointEstimates: [
      {
        waypointId: 1,
        travelCostMah: 200,
        travelTimeSec: 100,
        travelDistanceM: 200,
        actionCostMah: 0,
        actionTimeSec: 0,
        cumulativeCostMah: 200,
        cumulativeTimeSec: 100,
        remainingMah: 4800,
        remainingPercent: 96,
        rthCostFromHereMah: 80,
        rthTimeSec: 40,
        netRemainingAfterRthMah: 4720,
        safetyLevel: 'safe',
      },
      {
        waypointId: 2,
        travelCostMah: 300,
        travelTimeSec: 130,
        travelDistanceM: 300,
        actionCostMah: 200,
        actionTimeSec: 60,
        cumulativeCostMah: 700,
        cumulativeTimeSec: 290,
        remainingMah: 4300,
        remainingPercent: 86,
        rthCostFromHereMah: 150,
        rthTimeSec: 60,
        netRemainingAfterRthMah: 4150,
        safetyLevel: 'safe',
      },
    ],
    warnings: [],
    ...overrides,
  }
}

describe('generateBatteryRecommendations', () => {
  it('adds split-mission guidance when a point-of-no-return exists before the final waypoint', () => {
    const recommendations = generateBatteryRecommendations({
      report: createBaseReport({
        pointOfNoReturn: 1,
      }),
    })

    expect(
      recommendations.some((warning) =>
        warning.message.includes('splitting the mission around waypoint #1'),
      ),
    ).toBe(true)
  })

  it('adds action-energy recommendation when actions dominate mission cost', () => {
    const recommendations = generateBatteryRecommendations({
      report: createBaseReport({
        totalEnergyMah: 1000,
        totalTravelEnergyMah: 450,
        totalActionEnergyMah: 550,
      }),
    })

    expect(
      recommendations.some((warning) =>
        warning.message.includes('Actions account for'),
      ),
    ).toBe(true)
  })
})
