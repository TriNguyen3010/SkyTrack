import type {
  WaypointDensityConfig,
  WaypointDensityMetrics,
} from '../lib/waypointDensityModels'

interface WaypointDensityPanelProps {
  config: WaypointDensityConfig
  metrics: WaypointDensityMetrics
  isExpanded: boolean
  isPending: boolean
  onToggleExpanded: () => void
  onModeChange: (mode: WaypointDensityConfig['mode']) => void
  onCountChange: (count: number) => void
  onSpacingChange: (spacing: number) => void
}

function getModeLabel(mode: WaypointDensityConfig['mode']): string {
  switch (mode) {
    case 'auto':
      return 'auto'
    case 'count':
      return 'by count'
    case 'spacing':
      return 'by spacing'
  }
}

export function WaypointDensityPanel({
  config,
  metrics,
  isExpanded,
  isPending,
  onToggleExpanded,
  onModeChange,
  onCountChange,
  onSpacingChange,
}: WaypointDensityPanelProps) {
  const totalCountValue =
    config.mode === 'count' && config.targetCount !== null
      ? config.targetCount
      : metrics.totalCount
  const spacingValue =
    config.mode === 'spacing' && config.targetSpacing !== null
      ? config.targetSpacing
      : metrics.effectiveSpacing ?? 0

  return (
    <section className="density-panel">
      <div className="density-panel-header">
        <div className="density-panel-copy">
          <strong>Waypoints</strong>
          <span>
            {metrics.totalCount} waypoints · ~{metrics.effectiveSpacing ?? 0}m spacing (
            {getModeLabel(config.mode)})
          </span>
        </div>
        <button type="button" className="link-button" onClick={onToggleExpanded}>
          {isExpanded ? 'Hide' : 'Adjust'}
        </button>
      </div>

      {isExpanded && (
        <div className="density-panel-body">
          <div className="density-mode-group" role="radiogroup" aria-label="Waypoint density mode">
            {(['auto', 'count', 'spacing'] as const).map((mode) => (
              <label
                key={mode}
                className={`density-mode-pill ${config.mode === mode ? 'is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="waypoint-density-mode"
                  checked={config.mode === mode}
                  onChange={() => onModeChange(mode)}
                />
                <span>
                  {mode === 'auto'
                    ? 'Auto'
                    : mode === 'count'
                      ? 'By count'
                      : 'By spacing'}
                </span>
              </label>
            ))}
          </div>

          <div className="density-grid">
            <label className="control-field">
              <span>Total</span>
              <div className="density-input-row">
                <input
                  type="number"
                  min={metrics.minimumCount}
                  max={metrics.maximumCount ?? undefined}
                  value={Number.isFinite(totalCountValue) ? totalCountValue : ''}
                  readOnly={config.mode !== 'count'}
                  disabled={config.mode !== 'count'}
                  onChange={(event) => onCountChange(Number(event.target.value))}
                />
                <small>waypoints</small>
              </div>
            </label>

            <label className="control-field">
              <span>Spacing</span>
              <div className="density-input-row">
                <input
                  type="number"
                  min={2}
                  step={0.1}
                  value={Number.isFinite(spacingValue) ? spacingValue : ''}
                  readOnly={config.mode !== 'spacing'}
                  disabled={config.mode !== 'spacing'}
                  onChange={(event) => onSpacingChange(Number(event.target.value))}
                />
                <small>m</small>
              </div>
            </label>
          </div>

          <div className="density-metrics">
            <span>Anchors: {metrics.anchorCount}</span>
            <span>Added: {metrics.intermediateCount}</span>
          </div>

          <div className="density-limits">
            Min: {metrics.minimumCount} (anchors only)
            {metrics.maximumCount !== null ? ` · Max: ${metrics.maximumCount}` : ''}
          </div>

          {isPending && <div className="density-pending">Updating generated mission...</div>}
        </div>
      )}
    </section>
  )
}
