import type { BatteryWarning, MissionBatteryReport } from './batteryModels'
import { buildBatteryWarnings } from './batterySafety'

const ACTION_HEAVY_RATIO = 0.35
const LOW_RESERVE_PERCENT = 10

export function generateBatteryRecommendations({
  report,
  transientWarnings = [],
}: {
  report: MissionBatteryReport
  transientWarnings?: BatteryWarning[]
}): BatteryWarning[] {
  const warnings: BatteryWarning[] = [
    ...buildBatteryWarnings(report),
    ...transientWarnings,
  ]

  if (
    report.totalActionEnergyMah > 0 &&
    report.totalActionEnergyMah >= report.totalEnergyMah * ACTION_HEAVY_RATIO
  ) {
    warnings.push({
      level: 'caution',
      waypointId: null,
      message: `Actions account for ${Math.round(
        (report.totalActionEnergyMah / Math.max(report.totalEnergyMah, 1)) * 100,
      )}% of total mission energy.`,
      suggestion: 'Shorten hover, video, or suppress actions on the most expensive nodes.',
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
      message: `Consider splitting the mission around waypoint #${report.pointOfNoReturn}.`,
      suggestion: 'Ending a sortie before the point-of-no-return leaves more room for a safe second flight.',
    })
  }

  if (report.isFeasible && report.batteryRemainingPercent <= LOW_RESERVE_PERCENT) {
    warnings.push({
      level: 'caution',
      waypointId: null,
      message: `Only ~${Math.round(report.batteryRemainingPercent)}% reserve remains after this mission.`,
      suggestion: 'Increase reserve settings or trim the path before deployment.',
    })
  }

  return sortAndDedupeWarnings(warnings)
}

function sortAndDedupeWarnings(warnings: BatteryWarning[]): BatteryWarning[] {
  const severityOrder: Record<BatteryWarning['level'], number> = {
    critical: 0,
    warning: 1,
    caution: 2,
    safe: 3,
  }
  const uniqueWarnings = warnings.filter((warning, index) => {
    const signature = `${warning.level}:${warning.waypointId ?? 'mission'}:${warning.message}`

    return (
      warnings.findIndex(
        (candidate) =>
          `${candidate.level}:${candidate.waypointId ?? 'mission'}:${candidate.message}` ===
          signature,
      ) === index
    )
  })

  return uniqueWarnings.sort((left, right) => {
    const severityDelta = severityOrder[left.level] - severityOrder[right.level]

    if (severityDelta !== 0) {
      return severityDelta
    }

    if (left.waypointId === null && right.waypointId !== null) {
      return -1
    }

    if (left.waypointId !== null && right.waypointId === null) {
      return 1
    }

    return (left.waypointId ?? 0) - (right.waypointId ?? 0)
  })
}
