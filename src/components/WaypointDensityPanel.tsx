import { useEffect, useMemo, useState } from 'react'
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
      return 'add points'
    case 'spacing':
      return 'by spacing'
    case 'simplify':
      return 'simplify'
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
  const [draftCountValue, setDraftCountValue] = useState('')
  const totalCountValue =
    config.mode === 'count' && config.targetCount !== null
      ? config.targetCount
      : metrics.totalCount
  const spacingValue =
    config.mode === 'spacing' && config.targetSpacing !== null
      ? config.targetSpacing
      : metrics.effectiveSpacing ?? 0
  const inputMax = useMemo(
    () =>
      Math.max(
        metrics.maximumCount ?? 0,
        metrics.minimumCount * 3,
        metrics.totalCount,
        totalCountValue,
      ),
    [metrics.maximumCount, metrics.minimumCount, metrics.totalCount, totalCountValue],
  )
  const isCountMode = config.mode === 'count'
  const parsedDraftCount = Number(draftCountValue)
  const hasDraftCount = draftCountValue.trim().length > 0
  const isBelowMinimum =
    isCountMode &&
    hasDraftCount &&
    Number.isFinite(parsedDraftCount) &&
    parsedDraftCount < metrics.minimumCount
  const addedPoints = Math.max(metrics.totalCount - metrics.anchorCount, 0)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setDraftCountValue(isCountMode ? `${totalCountValue}` : '')
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [isCountMode, totalCountValue])

  useEffect(() => {
    if (!isBelowMinimum) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      onCountChange(metrics.minimumCount)
      setDraftCountValue(`${metrics.minimumCount}`)
    }, 1500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isBelowMinimum, metrics.minimumCount, onCountChange])

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
                      ? 'Add points'
                      : 'By spacing'}
                </span>
              </label>
            ))}
          </div>

          <div className="density-grid">
            <label className="control-field">
              <span>Target total</span>
              <div className="density-input-row">
                <input
                  type="number"
                  min={metrics.minimumCount}
                  max={inputMax}
                  value={isCountMode ? draftCountValue : ''}
                  readOnly={!isCountMode}
                  disabled={!isCountMode}
                  className={isBelowMinimum ? 'is-invalid' : undefined}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setDraftCountValue(nextValue)

                    const numericValue = Number(nextValue)

                    if (!Number.isFinite(numericValue) || numericValue < metrics.minimumCount) {
                      return
                    }

                    onCountChange(numericValue)
                  }}
                />
                <small>waypoints</small>
              </div>
              {isCountMode && (
                <input
                  className="density-slider"
                  type="range"
                  min={metrics.minimumCount}
                  max={inputMax}
                  step={1}
                  value={Number.isFinite(totalCountValue) ? totalCountValue : metrics.minimumCount}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value)
                    setDraftCountValue(`${nextValue}`)
                    onCountChange(nextValue)
                  }}
                />
              )}
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

          <div className="density-breakdown">
            <div className="density-breakdown-row">
              <span>{metrics.anchorCount} turn points (fixed)</span>
              <strong>{metrics.anchorCount}</strong>
            </div>
            <div className="density-breakdown-row">
              <span>{addedPoints} added points</span>
              <strong>{addedPoints}</strong>
            </div>
            <div className="density-breakdown-divider" />
            <div className="density-breakdown-row is-total">
              <span>Total waypoints</span>
              <strong>{metrics.totalCount}</strong>
            </div>
          </div>

          <div className="density-metrics">
            <span>Turn points: {metrics.anchorCount}</span>
            <span>Added: {metrics.intermediateCount}</span>
          </div>

          <div className="density-limits">
            Min: {metrics.minimumCount} turn points
            {metrics.maximumCount !== null ? ` · Max: ${metrics.maximumCount}` : ''}
          </div>

          {isCountMode && metrics.totalCount === metrics.minimumCount && (
            <div className="density-note">
              Only turn points right now. No added points between them yet.
            </div>
          )}

          {isBelowMinimum && (
            <div className="density-note is-warning">
              Min is {metrics.minimumCount} turn points. Smaller values will clamp after a moment.
            </div>
          )}

          {isPending && <div className="density-pending">Updating generated mission...</div>}
        </div>
      )}
    </section>
  )
}
