import {
  Aperture,
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronRight,
  ClipboardPlus,
  Code2,
  Flame,
  FlaskConical,
  Hexagon,
  Home,
  Layers,
  LayoutGrid,
  MousePointer2,
  MoveVertical,
  Package,
  PencilLine,
  Plane,
  Play,
  Plus,
  Radar,
  Rocket,
  RotateCcw,
  Route,
  ScanLine,
  TimerReset,
  Trash2,
  Video,
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
import {
  WAYPOINT_ACTION_OPTIONS,
  getWaypointActionLabel,
  summarizeWaypointAction,
  validateWaypointAction,
  type MissionWaypointAction,
  type MissionWaypointActionType,
  type WaypointActionPatch,
} from './lib/waypointActions'
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
  const addWaypointAction = useMissionStore((state) => state.addWaypointAction)
  const updateWaypointAction = useMissionStore((state) => state.updateWaypointAction)
  const removeWaypointAction = useMissionStore((state) => state.removeWaypointAction)
  const moveWaypointAction = useMissionStore((state) => state.moveWaypointAction)
  const [interactionNotice, setInteractionNotice] = useState<InteractionNotice | null>(null)
  const [pendingActionType, setPendingActionType] =
    useState<MissionWaypointActionType>('hover')
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
  const selectedActionOption = useMemo(
    () =>
      WAYPOINT_ACTION_OPTIONS.find((option) => option.type === pendingActionType) ??
      WAYPOINT_ACTION_OPTIONS[0],
    [pendingActionType],
  )
  const totalWaypointActions = useMemo(
    () =>
      waypoints.reduce((total, waypoint) => total + waypoint.actions.length, 0),
    [waypoints],
  )
  const waypointsWithActions = useMemo(
    () => waypoints.filter((waypoint) => waypoint.actions.length > 0).length,
    [waypoints],
  )
  const selectedWaypointValidationMessages = useMemo(
    () =>
      selectedWaypoint
        ? selectedWaypoint.actions.flatMap((action) => validateWaypointAction(action))
        : [],
    [selectedWaypoint],
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
                    {waypoints.length} pts · {waypointsWithActions} action nodes ·{' '}
                    {totalWaypointActions} actions · ~
                    {Math.round(area)} m²
                  </p>
                  {selectedWaypoint && (
                    <div className="selected-waypoint-summary">
                      Selected WP {selectedWaypoint.id} · X{' '}
                      {formatWaypointCoordinate(selectedWaypoint.x)} · Y{' '}
                      {formatWaypointCoordinate(selectedWaypoint.y)} · Z{' '}
                      {formatWaypointCoordinate(selectedWaypoint.z)}m ·{' '}
                      {selectedWaypoint.actions.length} actions
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
                    <span>
                      {waypoints.length} waypoints · {waypointsWithActions} action nodes ·{' '}
                      {totalWaypointActions} actions
                    </span>
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

                {selectedWaypoint ? (
                  <WaypointActionEditor
                    waypoint={selectedWaypoint}
                    validationMessages={selectedWaypointValidationMessages}
                    pendingActionType={pendingActionType}
                    selectedActionDescription={selectedActionOption.description}
                    onPendingActionTypeChange={setPendingActionType}
                    onAddAction={addWaypointAction}
                    onUpdateAction={updateWaypointAction}
                    onRemoveAction={removeWaypointAction}
                    onMoveAction={moveWaypointAction}
                  />
                ) : (
                  <div className="empty-action-state">
                    Select a waypoint to configure node actions.
                  </div>
                )}
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
  const actionSummary = summarizeWaypointActionStack(waypoint.actions)

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
          <div className="waypoint-row-meta">
            <span>{isSelected ? 'Selected in viewport' : 'Waypoint target'}</span>
            {waypoint.actions.length > 0 && (
              <span className="waypoint-action-pill">
                {waypoint.actions.length} action
                {waypoint.actions.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {actionSummary && <span className="waypoint-action-summary">{actionSummary}</span>}
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

function WaypointActionEditor({
  waypoint,
  validationMessages,
  pendingActionType,
  selectedActionDescription,
  onPendingActionTypeChange,
  onAddAction,
  onUpdateAction,
  onRemoveAction,
  onMoveAction,
}: {
  waypoint: MissionWaypoint
  validationMessages: string[]
  pendingActionType: MissionWaypointActionType
  selectedActionDescription: string
  onPendingActionTypeChange: (type: MissionWaypointActionType) => void
  onAddAction: (waypointId: number, type: MissionWaypointActionType) => void
  onUpdateAction: (
    waypointId: number,
    actionId: number,
    patch: WaypointActionPatch,
  ) => void
  onRemoveAction: (waypointId: number, actionId: number) => void
  onMoveAction: (
    waypointId: number,
    actionId: number,
    direction: 'up' | 'down',
  ) => void
}) {
  return (
    <div className="action-editor-card">
      <div className="action-editor-header">
        <div className="action-editor-copy">
          <strong>Waypoint {waypoint.id} Actions</strong>
          <span>Assign mission behaviors to this node.</span>
        </div>
        <div className="action-editor-count">
          {waypoint.actions.length} action{waypoint.actions.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="action-add-block">
        <label className="field-label" htmlFor="waypoint-action-type">
          Add Action
        </label>
        <div className="action-add-row">
          <select
            id="waypoint-action-type"
            className="action-select"
            value={pendingActionType}
            onChange={(event) =>
              onPendingActionTypeChange(event.target.value as MissionWaypointActionType)
            }
          >
            {WAYPOINT_ACTION_OPTIONS.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button button-primary-small"
            onClick={() => onAddAction(waypoint.id, pendingActionType)}
          >
            <Plus size={14} strokeWidth={2.2} />
            Add
          </button>
        </div>
        <p className="action-add-help">{selectedActionDescription}</p>
      </div>

      <div
        className={`action-status-card ${
          validationMessages.length > 0 ? 'is-warning' : 'is-ready'
        }`}
      >
        <span className="action-status-dot" />
        <div className="action-status-copy">
          <strong>
            {validationMessages.length > 0
              ? 'Action config needs attention'
              : 'Action config ready'}
          </strong>
          <span>
            {validationMessages.length > 0
              ? validationMessages[0]
              : waypoint.actions.length > 0
                ? 'Selected waypoint is safe to carry into simulation and export flows later.'
                : 'Add actions here when this waypoint needs mission behavior.'}
          </span>
        </div>
      </div>

      {waypoint.actions.length > 0 ? (
        <div className="action-list">
          {waypoint.actions.map((action, index) => (
            <WaypointActionCard
              key={action.id}
              waypointId={waypoint.id}
              action={action}
              index={index}
              total={waypoint.actions.length}
              onUpdateAction={onUpdateAction}
              onRemoveAction={onRemoveAction}
              onMoveAction={onMoveAction}
            />
          ))}
        </div>
      ) : (
        <div className="empty-action-state is-inline">
          No actions yet. Add one to turn this waypoint into an execution node.
        </div>
      )}
    </div>
  )
}

function WaypointActionCard({
  waypointId,
  action,
  index,
  total,
  onUpdateAction,
  onRemoveAction,
  onMoveAction,
}: {
  waypointId: number
  action: MissionWaypointAction
  index: number
  total: number
  onUpdateAction: (
    waypointId: number,
    actionId: number,
    patch: WaypointActionPatch,
  ) => void
  onRemoveAction: (waypointId: number, actionId: number) => void
  onMoveAction: (
    waypointId: number,
    actionId: number,
    direction: 'up' | 'down',
  ) => void
}) {
  return (
    <div className="waypoint-action-card">
      <div className="waypoint-action-top">
        <div className="waypoint-action-heading">
          <div className="waypoint-action-index">{index + 1}</div>
          <div className="waypoint-action-copy">
            <strong>
              {renderWaypointActionIcon(action.type)}
              {getWaypointActionLabel(action.type)}
            </strong>
            <span>{summarizeWaypointAction(action)}</span>
          </div>
        </div>

        <div className="waypoint-action-controls">
          <button
            type="button"
            className="icon-button"
            onClick={() => onMoveAction(waypointId, action.id, 'up')}
            disabled={index === 0}
            aria-label="Move action up"
          >
            <ArrowUp size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onMoveAction(waypointId, action.id, 'down')}
            disabled={index === total - 1}
            aria-label="Move action down"
          >
            <ArrowDown size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="icon-button is-danger"
            onClick={() => onRemoveAction(waypointId, action.id)}
            aria-label="Remove action"
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="waypoint-action-fields">
        {action.type === 'hover' && (
          <ActionNumberField
            label="Duration"
            value={action.config.durationSec}
            suffix="sec"
            min={1}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { durationSec: value })
            }
          />
        )}

        {action.type === 'take_photo' && (
          <ActionNumberField
            label="Burst Count"
            value={action.config.burstCount}
            min={1}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { burstCount: value })
            }
          />
        )}

        {action.type === 'record_video' && (
          <ActionNumberField
            label="Duration"
            value={action.config.durationSec}
            suffix="sec"
            min={1}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { durationSec: value })
            }
          />
        )}

        {action.type === 'drop_payload' && (
          <ActionTextField
            label="Payload Type"
            value={action.config.payloadType}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { payloadType: value })
            }
          />
        )}

        {action.type === 'fire_suppress' && (
          <ActionNumberField
            label="Duration"
            value={action.config.durationSec}
            suffix="sec"
            min={1}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { durationSec: value })
            }
          />
        )}

        {action.type === 'change_altitude' && (
          <ActionNumberField
            label="Altitude Delta"
            value={action.config.altitudeDelta}
            suffix="m"
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { altitudeDelta: value })
            }
          />
        )}

        {action.type === 'set_gimbal' && (
          <ActionNumberField
            label="Pitch"
            value={action.config.pitch}
            suffix="deg"
            min={-90}
            max={30}
            step={1}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { pitch: value })
            }
          />
        )}

        {action.type === 'trigger_sensor' && (
          <ActionTextField
            label="Sensor Name"
            value={action.config.sensorName}
            onChange={(value) =>
              onUpdateAction(waypointId, action.id, { sensorName: value })
            }
          />
        )}
      </div>
    </div>
  )
}

function ActionNumberField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  suffix?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="action-field">
      <span className="action-field-label">{label}</span>
      <div className="action-input-wrap">
        <input
          className="action-input"
          type="number"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(event) => {
            const nextValue = Number(event.target.value)

            if (!Number.isNaN(nextValue)) {
              onChange(nextValue)
            }
          }}
        />
        {suffix && <span className="action-input-suffix">{suffix}</span>}
      </div>
    </label>
  )
}

function ActionTextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="action-field">
      <span className="action-field-label">{label}</span>
      <input
        className="action-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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

function summarizeWaypointActionStack(actions: MissionWaypointAction[]): string | null {
  if (actions.length === 0) {
    return null
  }

  const firstAction = summarizeWaypointAction(actions[0])

  if (actions.length === 1) {
    return firstAction
  }

  return `${firstAction} +${actions.length - 1} more`
}

function renderWaypointActionIcon(type: MissionWaypointActionType) {
  switch (type) {
    case 'hover':
      return <TimerReset size={15} strokeWidth={2.1} />
    case 'take_photo':
      return <Camera size={15} strokeWidth={2.1} />
    case 'record_video':
      return <Video size={15} strokeWidth={2.1} />
    case 'drop_payload':
      return <Package size={15} strokeWidth={2.1} />
    case 'fire_suppress':
      return <Flame size={15} strokeWidth={2.1} />
    case 'change_altitude':
      return <MoveVertical size={15} strokeWidth={2.1} />
    case 'set_gimbal':
      return <Aperture size={15} strokeWidth={2.1} />
    case 'trigger_sensor':
      return <Radar size={15} strokeWidth={2.1} />
  }
}

export default App
