import {
  ChevronDown,
  ChevronRight,
  ClipboardPlus,
  Code2,
  FlaskConical,
  Hexagon,
  Home,
  Layers,
  LayoutGrid,
  MousePointer2,
  PencilLine,
  Plane,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Route,
  ScanLine,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { MissionViewport3D } from './components/MissionViewport3D'
import {
  canAppendPointToOpenPath,
  generateCoverageSegments,
  generateCoverageWaypoints,
  isSimplePolygon,
  polygonArea,
} from './lib/missionGeometry'
import {
  useMissionStore,
  type MissionPoint,
  type MissionWaypoint,
} from './store/useMissionStore'
import './App.css'

const toolbarItems = [
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'grid', label: 'Grid', icon: LayoutGrid },
  { id: 'shape', label: 'Shapes', icon: Hexagon },
  { id: 'select', label: 'Select', icon: MousePointer2 },
] as const

interface InteractionNotice {
  tone: 'warning' | 'danger'
  message: string
}

function App() {
  const operationMode = useMissionStore((state) => state.operationMode)
  const editorTab = useMissionStore((state) => state.editorTab)
  const stage = useMissionStore((state) => state.stage)
  const scanAltitude = useMissionStore((state) => state.scanAltitude)
  const lineSpacing = useMissionStore((state) => state.lineSpacing)
  const orientation = useMissionStore((state) => state.orientation)
  const points = useMissionStore((state) => state.points)
  const waypoints = useMissionStore((state) => state.waypoints)
  const selectedWaypointId = useMissionStore((state) => state.selectedWaypointId)
  const setOperationMode = useMissionStore((state) => state.setOperationMode)
  const setEditorTab = useMissionStore((state) => state.setEditorTab)
  const setScanAltitude = useMissionStore((state) => state.setScanAltitude)
  const setLineSpacing = useMissionStore((state) => state.setLineSpacing)
  const setOrientation = useMissionStore((state) => state.setOrientation)
  const enterSetup = useMissionStore((state) => state.enterSetup)
  const cancelSetup = useMissionStore((state) => state.cancelSetup)
  const startDrawing = useMissionStore((state) => state.startDrawing)
  const cancelDrawing = useMissionStore((state) => state.cancelDrawing)
  const closePolygon = useMissionStore((state) => state.closePolygon)
  const generateMissionPath = useMissionStore((state) => state.generatePath)
  const editGeneratedPath = useMissionStore((state) => state.editGeneratedPath)
  const redrawMission = useMissionStore((state) => state.redrawMission)
  const resetMission = useMissionStore((state) => state.resetMission)
  const addPoint = useMissionStore((state) => state.addPoint)
  const updatePoint = useMissionStore((state) => state.updatePoint)
  const selectWaypoint = useMissionStore((state) => state.selectWaypoint)
  const [interactionNotice, setInteractionNotice] = useState<InteractionNotice | null>(null)
  const isPolygonValid = useMemo(
    () => points.length >= 3 && isSimplePolygon(points),
    [points],
  )

  const coverageSegments = useMemo(
    () =>
      (stage === 'editing' || stage === 'generated') && isPolygonValid
        ? generateCoverageSegments(points, lineSpacing, orientation)
        : [],
    [isPolygonValid, lineSpacing, orientation, points, stage],
  )
  const generatedWaypoints = useMemo(
    () => generateCoverageWaypoints(coverageSegments, scanAltitude),
    [coverageSegments, scanAltitude],
  )
  const area = useMemo(() => polygonArea(points), [points])
  const selectedWaypoint = useMemo(
    () => waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null,
    [selectedWaypointId, waypoints],
  )
  const activeNotice =
    interactionNotice &&
    (stage === 'setup' || stage === 'drawing' || stage === 'editing')
      ? interactionNotice
      : null

  function clearInteractionNotice() {
    setInteractionNotice(null)
  }

  function handleAddPoint(x: number, y: number) {
    if (!canAppendPointToOpenPath(points, { x, y })) {
      setInteractionNotice({
        tone: 'danger',
        message: 'Path cannot cross itself. Place the next point along the outer boundary.',
      })
      return
    }

    clearInteractionNotice()
    addPoint(x, y)
  }

  function handleUpdatePoint(id: number, x: number, y: number) {
    const candidate = points.map((point) => (point.id === id ? { ...point, x, y } : point))

    if (!isSimplePolygon(candidate)) {
      setInteractionNotice({
        tone: 'danger',
        message: 'Polygon fill needs a simple boundary. This move would create crossing edges.',
      })
      return
    }

    clearInteractionNotice()
    updatePoint(id, x, y)
  }

  function handleClosePolygon() {
    if (!isPolygonValid) {
      setInteractionNotice({
        tone: 'danger',
        message: 'Close the area with a non-crossing boundary before continuing.',
      })
      return
    }

    clearInteractionNotice()
    closePolygon()
  }

  function handleGeneratePath() {
    if (!isPolygonValid || generatedWaypoints.length === 0) {
      setInteractionNotice({
        tone: 'warning',
        message: 'Coverage path is only available after the polygon boundary is valid.',
      })
      return
    }

    clearInteractionNotice()
    generateMissionPath(generatedWaypoints)
  }

  const viewportHint = activeNotice?.message
    ? activeNotice.message
    : stage === 'setup'
      ? 'Tap highlighted altitude plane to place first point'
      : stage === 'drawing'
        ? 'Click first point to close polygon'
        : stage === 'editing'
          ? 'Click & drag points to adjust position'
          : stage === 'generated'
            ? 'Generated path ready · select waypoint to inspect'
            : null

  return (
    <main className="app-shell">
      <header className="topbar">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <span className="breadcrumb-item">
            <Home size={14} strokeWidth={2.2} />
            Home
          </span>
          <ChevronRight size={14} />
          <span className="breadcrumb-item">Project</span>
          <ChevronRight size={14} />
          <span className="breadcrumb-item is-current">Mission</span>
        </nav>

        <div className="mode-switch" role="tablist" aria-label="Operation mode">
          <button
            type="button"
            className={`mode-pill ${operationMode === 'simulation' ? 'is-active' : ''}`}
            onClick={() => setOperationMode('simulation')}
          >
            <FlaskConical size={15} strokeWidth={2} />
            Simulation
          </button>
          <button
            type="button"
            className={`mode-pill ${operationMode === 'deployment' ? 'is-active' : ''}`}
            onClick={() => setOperationMode('deployment')}
          >
            <Rocket size={15} strokeWidth={2} />
            Deployment
          </button>
        </div>
      </header>

      <section className="status-banner">
        <strong>READY TO FLY</strong>
      </section>

      <section className="workspace">
        <section className="viewport-panel" aria-label="Mission viewport">
          <div
            className={`viewport-stage ${
              stage === 'setup' || stage === 'drawing' ? 'is-drawing' : ''
            }`}
          >
            {viewportHint && (
              <div
                className={`viewport-hint ${
                  activeNotice ? `is-${activeNotice.tone}` : ''
                }`}
              >
                <span className="hint-dot" />
                {viewportHint}
              </div>
            )}

            <MissionViewport3D
              stage={stage}
              scanAltitude={scanAltitude}
              points={points}
              coverageSegments={coverageSegments}
              waypoints={waypoints}
              selectedWaypointId={selectedWaypointId}
              onStartDrawing={startDrawing}
              onAddPoint={handleAddPoint}
              onUpdatePoint={handleUpdatePoint}
              onClosePolygon={handleClosePolygon}
              onSelectWaypoint={selectWaypoint}
            />

            <div className="viewport-toolbar" aria-label="Viewport tools">
              {toolbarItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`tool-button ${id === 'layers' ? 'is-active' : ''}`}
                  aria-label={label}
                >
                  <Icon size={16} strokeWidth={2.1} />
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="sidebar" aria-label="Mission controls">
          <div className="action-row">
            <button type="button" className="button button-secondary" onClick={resetMission}>
              <RotateCcw size={18} strokeWidth={2.2} />
              Reset
            </button>
            <button type="button" className="button button-primary">
              <Play size={18} strokeWidth={2.2} fill="currentColor" />
              Simulate
              <ChevronDown size={16} strokeWidth={2.2} />
            </button>
          </div>

          <div className="mission-toggle">
            <span className="checkbox" aria-hidden="true" />
            <span>Building Mission</span>
          </div>

          <div className="editor-tabs" role="tablist" aria-label="Editor mode">
            <button
              type="button"
              className={`editor-tab ${editorTab === 'design' ? 'is-active' : ''}`}
              onClick={() => setEditorTab('design')}
            >
              <PencilLine size={14} strokeWidth={2.1} />
              Design
            </button>
            <button
              type="button"
              className={`editor-tab ${editorTab === 'code' ? 'is-active' : ''}`}
              onClick={() => setEditorTab('code')}
            >
              <Code2 size={14} strokeWidth={2.1} />
              Code
            </button>
            <button type="button" className="doc-button" aria-label="Add mission note">
              <ClipboardPlus size={14} strokeWidth={2.1} />
            </button>
          </div>

          <section className="panel-section">
            <header className="section-header">
              <div className="section-title">
                <Route size={15} strokeWidth={2.1} />
                <span>Path Plan</span>
              </div>
              <ChevronDown size={16} strokeWidth={2.1} />
            </header>

            {stage === 'idle' && (
              <div className="plan-card">
                <div className="plan-icon">
                  <Route size={18} strokeWidth={2.2} />
                </div>
                <div className="plan-copy">
                  <h2>Coverage Area Scan</h2>
                  <p>Automated polygon scan path</p>
                </div>
                <button type="button" className="inline-cta" onClick={enterSetup}>
                  Setup
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>
            )}

            {stage === 'setup' && (
              <div className="setup-panel">
                <div className="setup-mode">
                  <span className="setup-dot" />
                  <span>Coverage Area Scan</span>
                </div>

                <label className="field-label" htmlFor="scan-altitude">
                  Scan Altitude
                </label>

                <div className="slider-row">
                  <input
                    id="scan-altitude"
                    className="slider"
                    type="range"
                    min="20"
                    max="120"
                    step="1"
                    value={scanAltitude}
                    onChange={(event) => setScanAltitude(Number(event.target.value))}
                  />
                  <div className="slider-value">{scanAltitude}m</div>
                </div>

                <div className="button-row">
                  <button type="button" className="button button-cancel" onClick={cancelSetup}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button button-primary button-primary-small"
                    onClick={startDrawing}
                  >
                    Start Drawing
                  </button>
                </div>
              </div>
            )}

            {stage === 'drawing' && (
              <div className="drawing-panel">
                <div className="setup-mode">
                  <span className="setup-dot" />
                  <span>Drawing Coverage Area</span>
                </div>

                <div className="stat-strip">
                  <div className="stat-pill">Alt {scanAltitude}m</div>
                  <div className="stat-pill">Pts {points.length}</div>
                </div>

                <div className="hint-card">
                  <span className="hint-icon">✦</span>
                  {activeNotice?.message ?? 'Click first point to close polygon'}
                </div>

                <button
                  type="button"
                  className="button button-danger"
                  onClick={cancelDrawing}
                >
                  Cancel Drawing
                </button>
              </div>
            )}

            {stage === 'editing' && (
              <div className="editing-panel">
                <div className="setup-mode">
                  <ScanLine size={16} strokeWidth={2.2} />
                  <span>Coverage Area Scan</span>
                </div>

                <div className="summary-grid">
                  <div className="summary-card">
                    <span className="summary-label">Area</span>
                    <strong>~{Math.round(area)} m²</strong>
                  </div>
                  <div className="summary-card">
                    <span className="summary-label">Points</span>
                    <strong>{points.length}</strong>
                  </div>
                </div>

                {activeNotice && (
                  <div className="validation-card">
                    <span className="validation-card-dot" />
                    <span>{activeNotice.message}</span>
                  </div>
                )}

                <div className="vertices-card">
                  <div className="vertices-header">
                    <span>Vertices</span>
                    <small>drag in 3D to move</small>
                  </div>

                  <div className="vertices-list">
                    {points.map((point) => (
                      <VertexRow key={point.id} point={point} />
                    ))}
                  </div>
                </div>

                <SliderField
                  id="phase2-altitude"
                  label="Scan Altitude"
                  min={20}
                  max={120}
                  step={1}
                  value={scanAltitude}
                  valueLabel={`${scanAltitude}m`}
                  onChange={setScanAltitude}
                />

                <SliderField
                  id="phase2-spacing"
                  label="Line Spacing"
                  min={6}
                  max={30}
                  step={1}
                  value={lineSpacing}
                  valueLabel={`${lineSpacing}m`}
                  onChange={setLineSpacing}
                />

                <SliderField
                  id="phase2-orientation"
                  label="Orientation"
                  min={-90}
                  max={90}
                  step={1}
                  value={orientation}
                  valueLabel={`${orientation}°`}
                  onChange={setOrientation}
                />

                <div className="button-row">
                  <button
                    type="button"
                    className="button button-cancel"
                    onClick={redrawMission}
                  >
                    Redraw
                  </button>
                  <button
                    type="button"
                    className="button button-primary button-primary-small"
                    onClick={handleGeneratePath}
                    disabled={generatedWaypoints.length === 0 || !isPolygonValid}
                  >
                    Generate Path
                  </button>
                </div>
              </div>
            )}

            {stage === 'generated' && (
              <div className="generated-panel">
                <div className="generated-summary-card">
                  <div className="generated-summary-top">
                    <div className="setup-mode">
                      <ScanLine size={16} strokeWidth={2.2} />
                      <span>Coverage Area Scan</span>
                    </div>
                    <button
                      type="button"
                      className="link-button"
                      onClick={editGeneratedPath}
                    >
                      Edit
                    </button>
                  </div>
                  <p className="generated-summary-meta">
                    Alt: {scanAltitude}m · Spacing: {lineSpacing}m · {orientation}° ·{' '}
                    {waypoints.length} pts · ~{Math.round(area)} m²
                  </p>
                  {selectedWaypoint && (
                    <div className="selected-waypoint-summary">
                      Selected WP {selectedWaypoint.id} · X{' '}
                      {formatWaypointCoordinate(selectedWaypoint.x)} · Y{' '}
                      {formatWaypointCoordinate(selectedWaypoint.y)} · Z{' '}
                      {formatWaypointCoordinate(selectedWaypoint.z)}m
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="panel-section">
            <header className="section-header">
              <div className="section-title section-title-muted">
                <Plane size={15} strokeWidth={2.1} />
                <span>
                  Vehicle Behavior{stage === 'generated' ? ` (${waypoints.length})` : ''}
                </span>
              </div>
              {stage === 'generated' ? (
                <button
                  type="button"
                  className="link-button link-button-subtle"
                  onClick={() => selectWaypoint(null)}
                >
                  Clear
                </button>
              ) : (
                <ChevronDown size={16} strokeWidth={2.1} />
              )}
            </header>

            {stage === 'generated' ? (
              <div className="behavior-list">
                <div className="behavior-overview">
                  <div className="behavior-overview-icon">
                    <Route size={16} strokeWidth={2.2} />
                  </div>
                  <div className="behavior-overview-copy">
                    <strong>Coverage Area Scan</strong>
                    <span>{waypoints.length} waypoints</span>
                  </div>
                </div>

                {waypoints.map((waypoint) => (
                  <WaypointBehaviorRow
                    key={waypoint.id}
                    waypoint={waypoint}
                    isSelected={selectedWaypointId === waypoint.id}
                    onSelect={selectWaypoint}
                  />
                ))}
              </div>
            ) : (
              <button type="button" className="button behavior-button">
                <Plus size={16} strokeWidth={2.2} />
                Add behavior
              </button>
            )}
          </section>
        </aside>
      </section>
    </main>
  )
}

function SliderField({
  id,
  label,
  min,
  max,
  step,
  value,
  valueLabel,
  onChange,
}: {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  valueLabel: string
  onChange: (value: number) => void
}) {
  return (
    <div className="slider-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="slider-row">
        <input
          id={id}
          className="slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="slider-value">{valueLabel}</div>
      </div>
    </div>
  )
}

function VertexRow({ point }: { point: MissionPoint }) {
  return (
    <div className="vertex-row">
      <div className="vertex-badge">{point.id}</div>
      <div className="vertex-coordinate">
        <span className="coordinate-label coordinate-label-x">X</span>
        <span>{formatCoordinate(point.x)}</span>
      </div>
      <div className="vertex-coordinate">
        <span className="coordinate-label coordinate-label-y">Y</span>
        <span>{formatCoordinate(point.y)}</span>
      </div>
    </div>
  )
}

function WaypointBehaviorRow({
  waypoint,
  isSelected,
  onSelect,
}: {
  waypoint: MissionWaypoint
  isSelected: boolean
  onSelect: (id: number) => void
}) {
  return (
    <button
      type="button"
      className={`waypoint-row ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelect(waypoint.id)}
    >
      <div className="waypoint-row-top">
        <div className="waypoint-index">{waypoint.id}</div>
        <div className="waypoint-copy">
          <strong>Navigate to waypoint</strong>
          <span>{isSelected ? 'Selected in viewport' : 'Waypoint target'}</span>
        </div>
      </div>

      <div className="waypoint-coordinates">
        <CoordinatePill label="Location X" value={formatWaypointCoordinate(waypoint.x)} />
        <CoordinatePill label="Location Y" value={formatWaypointCoordinate(waypoint.y)} />
        <CoordinatePill label="Location Z" value={formatWaypointCoordinate(waypoint.z)} />
      </div>
    </button>
  )
}

function CoordinatePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="coordinate-pill">
      <span>{label}</span>
      <strong>{value}m</strong>
    </div>
  )
}

function formatCoordinate(value: number): string {
  return `${Math.round(value * 10) / 10}`
}

function formatWaypointCoordinate(value: number): string {
  return value.toFixed(2)
}

export default App
