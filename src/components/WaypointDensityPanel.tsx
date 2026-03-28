import { useEffect, useState } from 'react'
import type {
  WaypointDensityConfig,
  WaypointDensityMetrics,
} from '../lib/waypointDensityModels'

interface WaypointDensityPanelProps {
  config: WaypointDensityConfig
  metrics: WaypointDensityMetrics
  countFloor: number
  countCeiling: number
  protectedCount: number
  originalAnchorCount: number
  isExpanded: boolean
  isPending: boolean
  onToggleExpanded: () => void
  onModeChange: (mode: WaypointDensityConfig['mode']) => void
  onCountChange: (count: number) => void
  onSpacingChange: (spacing: number) => void
  onResetToOriginal: () => void
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
  countFloor,
  countCeiling,
  protectedCount,
  originalAnchorCount,
  isExpanded,
  isPending,
  onToggleExpanded,
  onModeChange,
  onCountChange,
  onSpacingChange,
  onResetToOriginal,
}: WaypointDensityPanelProps) {
  const [draftCountValue, setDraftCountValue] = useState('')
  const isCountMode = config.mode === 'count'
  const isSimplifyMode = config.mode === 'simplify'
  const usesCountInput = isCountMode || isSimplifyMode
  const totalCountValue =
    usesCountInput && config.targetCount !== null
      ? config.targetCount
      : metrics.totalCount
  const spacingValue =
    config.mode === 'spacing' && config.targetSpacing !== null
      ? config.targetSpacing
      : metrics.effectiveSpacing ?? 0
  const inputMin = usesCountInput ? countFloor : metrics.minimumCount
  const inputMax = isSimplifyMode
    ? Math.max(countCeiling, inputMin)
    : Math.max(
        metrics.maximumCount ?? 0,
        metrics.minimumCount * 3,
        metrics.totalCount,
        totalCountValue,
      )
  const parsedDraftCount = Number(draftCountValue)
  const hasDraftCount = draftCountValue.trim().length > 0
  const isBelowMinimum =
    usesCountInput &&
    hasDraftCount &&
    Number.isFinite(parsedDraftCount) &&
    parsedDraftCount < inputMin
  const addedPoints = Math.max(metrics.totalCount - metrics.anchorCount, 0)
  const removableTurnPoints = Math.max(metrics.anchorCount - protectedCount, 0)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setDraftCountValue(usesCountInput ? `${totalCountValue}` : '')
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [totalCountValue, usesCountInput])

  useEffect(() => {
    if (!isBelowMinimum) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      onCountChange(inputMin)
      setDraftCountValue(`${inputMin}`)
    }, 1500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [inputMin, isBelowMinimum, onCountChange])

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
            {(['auto', 'count', 'spacing', 'simplify'] as const).map((mode) => (
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
                      : mode === 'spacing'
                        ? 'By spacing'
                        : 'Simplify'}
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
                  min={inputMin}
                  max={inputMax}
                  value={usesCountInput ? draftCountValue : ''}
                  readOnly={!usesCountInput}
                  disabled={!usesCountInput}
                  className={isBelowMinimum ? 'is-invalid' : undefined}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setDraftCountValue(nextValue)

                    const numericValue = Number(nextValue)

                    if (!Number.isFinite(numericValue) || numericValue < inputMin) {
                      return
                    }

                    onCountChange(numericValue)
                  }}
                />
                <small>waypoints</small>
              </div>
              {usesCountInput && (
                <input
                  className="density-slider"
                  type="range"
                  min={inputMin}
                  max={inputMax}
                  step={1}
                  value={Number.isFinite(totalCountValue) ? totalCountValue : inputMin}
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
            {isSimplifyMode ? (
              <>
                <div className="density-breakdown-row">
                  <span>{protectedCount} locked points</span>
                  <strong>{protectedCount}</strong>
                </div>
                <div className="density-breakdown-row">
                  <span>{removableTurnPoints} removable turn points</span>
                  <strong>{removableTurnPoints}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="density-breakdown-row">
                  <span>{metrics.anchorCount} turn points (fixed)</span>
                  <strong>{metrics.anchorCount}</strong>
                </div>
                <div className="density-breakdown-row">
                  <span>{addedPoints} added points</span>
                  <strong>{addedPoints}</strong>
                </div>
              </>
            )}
            <div className="density-breakdown-divider" />
            <div className="density-breakdown-row is-total">
              <span>Total waypoints</span>
              <strong>{metrics.totalCount}</strong>
            </div>
          </div>

          <div className="density-metrics">
            <span>Turn points: {metrics.anchorCount}</span>
            {isSimplifyMode ? (
              <span>Locked: {protectedCount}</span>
            ) : (
              <span>Added: {metrics.intermediateCount}</span>
            )}
          </div>

          <div className="density-limits">
            Min: {inputMin} {isSimplifyMode ? 'locked / required' : 'turn points'}
            {inputMax !== null ? ` · Max: ${inputMax}` : ''}
          </div>

          {isCountMode && metrics.totalCount === metrics.minimumCount && (
            <div className="density-note">
              Only turn points right now. No added points between them yet.
            </div>
          )}

          {isSimplifyMode && (
            <div className="density-note">
              Simplify removes the least important turn points first while keeping locked mission points. Original route: {originalAnchorCount} turn points.
            </div>
          )}

          {isSimplifyMode && metrics.totalCount === inputMin && (
            <div className="density-note">
              At the simplify floor. Further reduction would remove locked mission points.
            </div>
          )}

          {isSimplifyMode && (
            <button
              type="button"
              className="density-reset-button"
              onClick={onResetToOriginal}
            >
              Reset to original anchors
            </button>
          )}

          {isBelowMinimum && (
            <div className="density-note is-warning">
              Min is {inputMin}. Smaller values will clamp after a moment so locked mission points stay preserved.
            </div>
          )}

          {isPending && <div className="density-pending">Updating generated mission...</div>}
        </div>
      )}
    </section>
  )
}
