import type { MissionBatteryReport } from '../lib/batteryModels'

export function BatterySummaryBar({
  report,
  isExpanded,
  onToggle,
}: {
  report: MissionBatteryReport
  isExpanded: boolean
  onToggle: () => void
}) {
  const headline = report.isFeasible
    ? `${Math.round(report.batteryRemainingPercent)}% reserve left`
    : 'Not feasible with current reserve'
  const detailLabel = isExpanded ? 'Hide details' : 'Details'

  return (
    <div
      className={`battery-summary-card ${
        report.isFeasible ? 'is-feasible' : 'is-critical'
      }`}
    >
      <div className="battery-summary-header">
        <div className="battery-summary-copy">
          <strong>Battery</strong>
          <span>{headline}</span>
        </div>
        <div className="battery-summary-value">
          {report.isFeasible ? `${Math.round(report.batteryRemainingPercent)}%` : 'NOT FEASIBLE'}
        </div>
      </div>

      <div className="battery-gauge">
        <div
          className="battery-gauge-fill"
          style={{ width: `${Math.max(6, report.batteryRemainingPercent)}%` }}
        />
      </div>

      <div className="battery-summary-status">
        {report.isFeasible
          ? 'Estimated mission can complete with current reserve settings.'
          : report.feasibilityMessage}
      </div>

      <div className="battery-summary-disclaimer">
        Estimation only. Real battery usage can vary with wind, payload, battery health, and
        temperature.
      </div>

      <button
        type="button"
        className="battery-summary-toggle"
        onClick={onToggle}
      >
        {detailLabel}
      </button>

      {isExpanded && (
        <div className="battery-breakdown">
          <div className="battery-breakdown-row">
            <span>Flight</span>
            <span>
              {formatDuration(report.totalFlightTimeSec)} · {Math.round(report.totalTravelEnergyMah)} mAh
            </span>
          </div>
          <div className="battery-breakdown-row">
            <span>Actions</span>
            <span>
              {formatDuration(report.totalActionTimeSec)} · {Math.round(report.totalActionEnergyMah)} mAh
            </span>
          </div>
          <div className="battery-breakdown-row">
            <span>RTH reserve</span>
            <span>{Math.round(report.rthReserveMah)} mAh</span>
          </div>
          <div className="battery-breakdown-row">
            <span>Safety margin</span>
            <span>{Math.round(report.safetyMarginMah)} mAh</span>
          </div>
          <div className="battery-breakdown-row is-total">
            <span>Total required</span>
            <span>
              {Math.round(report.totalRequiredMah)} / {Math.round(report.availableBatteryMah)} mAh
            </span>
          </div>

          {report.pointOfNoReturn !== null && (
            <div className="battery-inline-warning">
              After WP #{report.pointOfNoReturn}, return-home margin becomes tight.
            </div>
          )}

          {!report.isFeasible && report.warnings[0] && (
            <div className="battery-inline-warning is-critical">
              {report.warnings[0].message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatDuration(valueSec: number): string {
  const roundedSec = Math.max(0, Math.round(valueSec))
  const minutes = Math.floor(roundedSec / 60)
  const seconds = roundedSec % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
