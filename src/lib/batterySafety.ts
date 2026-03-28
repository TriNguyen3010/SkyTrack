import type {
  BatteryWarning,
  MissionBatteryReport,
  SafetyLevel,
  SafetyPreset,
  WaypointBatteryEstimate,
} from './batteryModels'

const MIN_WARNING_ACTION_RATIO = 2

export function getSafetyMarginMah(
  capacityMah: number,
  hoverReserveMah: number,
  safetyPreset: SafetyPreset,
): number {
  return Math.max(
    capacityMah * (safetyPreset.reservePercent / 100),
    hoverReserveMah,
  )
}

export function classifySafetyLevel({
  remainingMah,
  rthCostFromHereMah,
  netRemainingAfterRthMah,
  safetyMarginMah,
}: {
  remainingMah: number
  rthCostFromHereMah: number
  netRemainingAfterRthMah: number
  safetyMarginMah: number
}): SafetyLevel {
  if (remainingMah < rthCostFromHereMah) {
    return 'critical'
  }

  if (netRemainingAfterRthMah > safetyMarginMah) {
    return 'safe'
  }

  if (netRemainingAfterRthMah > 0) {
    return 'caution'
  }

  return 'warning'
}

export function detectPointOfNoReturn(
  waypointEstimates: WaypointBatteryEstimate[],
  safetyMarginMah: number,
): number | null {
  let lastSafeWaypointId: number | null = null

  for (const estimate of waypointEstimates) {
    if (estimate.netRemainingAfterRthMah >= safetyMarginMah) {
      lastSafeWaypointId = estimate.waypointId
      continue
    }

    return lastSafeWaypointId ?? estimate.waypointId
  }

  return null
}

export function buildBatteryWarnings(
  report: MissionBatteryReport,
): BatteryWarning[] {
  const warnings: BatteryWarning[] = []

  if (!report.isFeasible) {
    const deficitMah = Math.max(0, report.totalRequiredMah - report.availableBatteryMah)

    warnings.push({
      level: 'critical',
      waypointId: null,
      message: `Mission needs about ${Math.round(deficitMah)} mAh more than the available battery budget.`,
      suggestion:
        'Reduce mission size, increase spacing, shorten high-cost actions, or split the mission.',
    })
  }

  if (
    report.pointOfNoReturn !== null &&
    report.waypointEstimates.length > 0 &&
    report.pointOfNoReturn !==
      report.waypointEstimates[report.waypointEstimates.length - 1]?.waypointId
  ) {
    warnings.push({
      level: 'warning',
      waypointId: report.pointOfNoReturn,
      message: `Waypoint #${report.pointOfNoReturn} is the last point with enough reserve for a safe return-to-home.`,
      suggestion: 'Waypoints after this point carry elevated battery risk.',
    })
  }

  for (const estimate of report.waypointEstimates) {
    if (
      estimate.actionCostMah > 0 &&
      estimate.actionCostMah >= estimate.travelCostMah * MIN_WARNING_ACTION_RATIO
    ) {
      warnings.push({
        level: 'caution',
        waypointId: estimate.waypointId,
        message: `Actions at waypoint #${estimate.waypointId} are unusually expensive (${Math.round(
          estimate.actionCostMah,
        )} mAh).`,
        suggestion: 'Consider shortening hover, video, or suppress durations at this node.',
      })
    }
  }

  return warnings
}
