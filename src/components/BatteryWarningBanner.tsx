import type { MissionBatteryReport } from '../lib/batteryModels'

export function BatteryWarningBanner({
  report,
}: {
  report: MissionBatteryReport
}) {
  if (report.isFeasible) {
    return null
  }

  const primaryWarning =
    report.warnings.find((warning) => warning.level === 'critical') ??
    report.warnings[0] ??
    null

  return (
    <div className="battery-warning-banner">
      <div className="battery-warning-banner-copy">
        <strong>Battery risk: mission not feasible</strong>
        <span>{primaryWarning?.message ?? report.feasibilityMessage}</span>
        {primaryWarning?.suggestion && <small>{primaryWarning.suggestion}</small>}
      </div>
      <div className="battery-warning-banner-meta">
        <span>{Math.round(report.totalRequiredMah - report.availableBatteryMah)} mAh short</span>
      </div>
    </div>
  )
}
