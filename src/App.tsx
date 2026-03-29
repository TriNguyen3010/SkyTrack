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
  ScanSearch,
  Radar,
  Rocket,
  RotateCcw,
  Route,
  ScanLine,
  TimerReset,
  Trash2,
  Video,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  BatterySummaryBar,
} from './components/BatterySummaryBar'
import {
  BatteryWarningBanner,
} from './components/BatteryWarningBanner'
import {
  DroneProfileSelector,
} from './components/DroneProfileSelector'
import {
  DroneSimulationPlaybackBar,
} from './components/DroneSimulationPlaybackBar'
import {
  WaypointDensityPanel,
} from './components/WaypointDensityPanel'
import {
  MissionViewport3D,
  type CameraDebugSnapshot,
  type WaypointContextMenuRequest,
  type ViewportAnimationState,
} from './components/MissionViewport3D'
import {
  computeBatteryReport,
  computeWaypointActionEnergy,
} from './lib/batteryEstimation'
import {
  DRONE_PRESETS,
  getSafetyPreset,
  resolveDroneProfile,
  SAFETY_PRESETS,
} from './lib/batteryPresets'
import {
  buildFlightPatternMission,
  clampPatternParams,
  createInitialPatternParams,
  FLIGHT_PATTERN_OPTIONS,
  getFlightPatternDefinition,
  getWaypointDensityConstraints,
  getFlightPatternOption,
  type FlightPatternMissionMeta,
  type FlightPatternId,
  type OrbitPatternParams,
  type PatternParamsMap,
} from './lib/flightPatterns'
import {
  WORLD_BOUNDS,
  canAppendPointToOpenPath,
  isSimplePolygon,
  polygonArea,
} from './lib/missionGeometry'
import {
  useMissionStore,
  type ExclusionZone,
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
import {
  canSetStartWaypoint,
  deriveWaypointInteractionModel,
  getWaypointValidationWarnings,
  isBulkAssignActive,
} from './lib/waypointInteraction'
import {
  getEnabledExclusionZones,
  getExclusionZoneValidationIssues,
} from './lib/exclusionValidation'
import type {
  DroneProfile,
  WaypointBatteryEstimate,
} from './lib/batteryModels'
import {
  computeWaypointDensityMetrics,
  getProtectedWaypointCount,
  getWaypointCountFloor,
} from './lib/waypointDensity'
import { DEFAULT_WAYPOINT_DENSITY_CONFIG } from './lib/waypointDensityModels'
import {
  countIntermediateWaypointActions,
  migrateAnchorActionsToDensityMission,
} from './lib/waypointDensityMigration'
import {
  DEFAULT_DRONE_SIMULATION_TELEMETRY,
  getNextDroneSimulationSpeed,
  type DroneSimulationCommand,
  type DroneSimulationCommandInput,
  type DroneSimulationSession,
  type DroneSimulationTelemetry,
} from './lib/droneSimulationPlayback'
import { DRONE_SIMULATION_HOVER_START_DELAY_MS } from './lib/droneSimulationConstants'
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

interface OverlayAnchor {
  x: number
  y: number
}

interface OverlayPanelSize {
  width: number
  height: number
}

function formatCameraDebugValue(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--'
}

function formatCameraDebugVector(vector: CameraDebugSnapshot['position']) {
  return `${formatCameraDebugValue(vector.x)}, ${formatCameraDebugValue(
    vector.y,
  )}, ${formatCameraDebugValue(vector.z)}`
}

interface WaypointRadialMenuState {
  waypointId: number
  anchor: OverlayAnchor
}

function App() {
  const operationMode = useMissionStore((state) => state.operationMode)
  const editorTab = useMissionStore((state) => state.editorTab)
  const stage = useMissionStore((state) => state.stage)
  const scanAltitude = useMissionStore((state) => state.scanAltitude)
  const lineSpacing = useMissionStore((state) => state.lineSpacing)
  const orientation = useMissionStore((state) => state.orientation)
  const droneProfileId = useMissionStore((state) => state.droneProfileId)
  const droneProfileOverrides = useMissionStore((state) => state.droneProfileOverrides)
  const homePoint = useMissionStore((state) => state.homePoint)
  const safetyPresetId = useMissionStore((state) => state.safetyPresetId)
  const points = useMissionStore((state) => state.points)
  const exclusionZones = useMissionStore((state) => state.exclusionZones)
  const activeExclusionZoneId = useMissionStore((state) => state.activeExclusionZoneId)
  const drawingTarget = useMissionStore((state) => state.drawingTarget)
  const waypointDensity = useMissionStore((state) => state.waypointDensity)
  const generatedWaypointDensity = useMissionStore(
    (state) => state.generatedWaypointDensity,
  )
  const generatedPatternId = useMissionStore((state) => state.generatedPatternId)
  const generatedPatternMeta = useMissionStore((state) => state.generatedPatternMeta)
  const generatedSegments = useMissionStore((state) => state.generatedSegments)
  const generatedAnchorWaypoints = useMissionStore(
    (state) => state.generatedAnchorWaypoints,
  )
  const generatedPathSegments = useMissionStore((state) => state.generatedPathSegments)
  const generatedClosed = useMissionStore((state) => state.generatedClosed)
  const waypoints = useMissionStore((state) => state.waypoints)
  const selectedWaypointId = useMissionStore((state) => state.selectedWaypointId)
  const startWaypointId = useMissionStore((state) => state.startWaypointId)
  const hoveredWaypointId = useMissionStore((state) => state.hoveredWaypointId)
  const bulkAssignActionType = useMissionStore((state) => state.bulkAssignActionType)
  const setOperationMode = useMissionStore((state) => state.setOperationMode)
  const setEditorTab = useMissionStore((state) => state.setEditorTab)
  const setScanAltitude = useMissionStore((state) => state.setScanAltitude)
  const setLineSpacing = useMissionStore((state) => state.setLineSpacing)
  const setOrientation = useMissionStore((state) => state.setOrientation)
  const setDroneProfileId = useMissionStore((state) => state.setDroneProfileId)
  const setSafetyPresetId = useMissionStore((state) => state.setSafetyPresetId)
  const setWaypointDensityMode = useMissionStore((state) => state.setWaypointDensityMode)
  const setTargetWaypointCount = useMissionStore((state) => state.setTargetWaypointCount)
  const setTargetWaypointSpacing = useMissionStore((state) => state.setTargetWaypointSpacing)
  const setWaypointDensityConfig = useMissionStore(
    (state) => state.setWaypointDensityConfig,
  )
  const addExclusionZone = useMissionStore((state) => state.addExclusionZone)
  const removeExclusionZone = useMissionStore((state) => state.removeExclusionZone)
  const renameExclusionZone = useMissionStore((state) => state.renameExclusionZone)
  const toggleExclusionZone = useMissionStore((state) => state.toggleExclusionZone)
  const setActiveExclusionZone = useMissionStore((state) => state.setActiveExclusionZone)
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
  const updateWaypointPosition = useMissionStore(
    (state) => state.updateWaypointPosition,
  )
  const setStartWaypoint = useMissionStore((state) => state.setStartWaypoint)
  const setHoveredWaypoint = useMissionStore((state) => state.setHoveredWaypoint)
  const setBulkAssignActionType = useMissionStore(
    (state) => state.setBulkAssignActionType,
  )
  const addWaypointAction = useMissionStore((state) => state.addWaypointAction)
  const duplicateWaypointAction = useMissionStore(
    (state) => state.duplicateWaypointAction,
  )
  const applyWaypointActionToTargets = useMissionStore(
    (state) => state.applyWaypointActionToTargets,
  )
  const updateWaypointAction = useMissionStore((state) => state.updateWaypointAction)
  const removeWaypointAction = useMissionStore((state) => state.removeWaypointAction)
  const moveWaypointAction = useMissionStore((state) => state.moveWaypointAction)
  const [interactionNotice, setInteractionNotice] = useState<InteractionNotice | null>(null)
  const [isReadyToClose, setIsReadyToClose] = useState(false)
  const [pendingActionType, setPendingActionType] =
    useState<MissionWaypointActionType>('hover')
  const [selectedPattern, setSelectedPattern] =
    useState<FlightPatternId>('coverage')
  const [patternParamsByPattern, setPatternParamsByPattern] =
    useState<PatternParamsMap>(() =>
      createInitialPatternParams({
        scanAltitude,
        lineSpacing,
        orientation,
      }),
    )
  const [hoveredPattern, setHoveredPattern] = useState<FlightPatternId | null>(null)
  const [patternPickerVisible, setPatternPickerVisible] = useState(false)
  const [, setPatternPickerAnchor] = useState<OverlayAnchor | null>(null)
  const [patternPickerManualPosition, setPatternPickerManualPosition] =
    useState<OverlayAnchor | null>(null)
  const [patternPickerSize, setPatternPickerSize] = useState<OverlayPanelSize>({
    width: 320,
    height: 420,
  })
  const [waypointRadialMenu, setWaypointRadialMenu] =
    useState<WaypointRadialMenuState | null>(null)
  const [viewportAnimationState, setViewportAnimationState] =
    useState<ViewportAnimationState>('settled')
  const [skipAnimationToken, setSkipAnimationToken] = useState(0)
  const [simulationSession, setSimulationSession] =
    useState<DroneSimulationSession | null>(null)
  const [simulationCommand, setSimulationCommand] =
    useState<DroneSimulationCommand | null>(null)
  const [simulationTelemetry, setSimulationTelemetry] =
    useState<DroneSimulationTelemetry>(DEFAULT_DRONE_SIMULATION_TELEMETRY)
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1)
  const [simulationFollowCamera, setSimulationFollowCamera] = useState(true)
  const [actionEditorFocusToken, setActionEditorFocusToken] = useState(0)
  const [isBatteryBreakdownExpanded, setIsBatteryBreakdownExpanded] =
    useState(false)
  const [isWaypointDensityExpanded, setIsWaypointDensityExpanded] = useState(false)
  const [viewportStageSize, setViewportStageSize] = useState({
    width: 0,
    height: 0,
  })
  const [cameraDebugSnapshot, setCameraDebugSnapshot] =
    useState<CameraDebugSnapshot | null>(null)
  const patternPickerRef = useRef<HTMLDivElement | null>(null)
  const waypointRadialMenuRef = useRef<HTMLDivElement | null>(null)
  const waypointActionEditorRef = useRef<HTMLDivElement | null>(null)
  const behaviorListRef = useRef<HTMLDivElement | null>(null)
  const waypointRowRefs = useRef(new Map<number, HTMLDivElement | null>())
  const viewportStageRef = useRef<HTMLDivElement | null>(null)
  const patternPickerDelayRef = useRef<number | null>(null)
  const patternHoverTransitionFrameRef = useRef<number | null>(null)
  const patternPickerDragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    width: number
    height: number
  } | null>(null)
  const patternPickerDragCleanupRef = useRef<(() => void) | null>(null)
  const simulationSessionKeyRef = useRef(0)
  const simulationCommandTokenRef = useRef(0)
  const previousSelectedPatternRef = useRef(selectedPattern)
  const selectedPatternOption = useMemo(
    () => getFlightPatternDefinition(selectedPattern),
    [selectedPattern],
  )
  const generatedPatternOption = useMemo(
    () =>
      generatedPatternId
        ? getFlightPatternDefinition(generatedPatternId)
        : selectedPatternOption,
    [generatedPatternId, selectedPatternOption],
  )
  const resolvedDroneProfile = useMemo(
    () => resolveDroneProfile(droneProfileId, droneProfileOverrides),
    [droneProfileId, droneProfileOverrides],
  )
  const resolvedSafetyPreset = useMemo(
    () => getSafetyPreset(safetyPresetId),
    [safetyPresetId],
  )
  const theoreticalFlightMinutes = useMemo(
    () => estimateTheoreticalFlightMinutes(resolvedDroneProfile),
    [resolvedDroneProfile],
  )
  const hoveredPatternOption = useMemo(
    () =>
      hoveredPattern ? getFlightPatternDefinition(hoveredPattern) : null,
    [hoveredPattern],
  )
  const reviewedPatternId = hoveredPattern ?? selectedPattern
  const activeExclusionZone = useMemo(
    () =>
      activeExclusionZoneId === null
        ? null
        : exclusionZones.find((zone) => zone.id === activeExclusionZoneId) ?? null,
    [activeExclusionZoneId, exclusionZones],
  )
  const activeDrawingPoints = useMemo(
    () =>
      drawingTarget === 'exclusion' ? activeExclusionZone?.points ?? [] : points,
    [activeExclusionZone, drawingTarget, points],
  )
  const enabledExclusionZones = useMemo(
    () => getEnabledExclusionZones(exclusionZones),
    [exclusionZones],
  )
  const isPolygonValid = useMemo(
    () => points.length >= 3 && isSimplePolygon(points),
    [points],
  )
  const isActiveDrawingPolygonValid = useMemo(
    () =>
      activeDrawingPoints.length >= 3 && isSimplePolygon(activeDrawingPoints),
    [activeDrawingPoints],
  )
  const activePreviewPattern = hoveredPattern ?? selectedPattern
  const activePatternParams = patternParamsByPattern[selectedPattern]
  const coverageParams = patternParamsByPattern.coverage
  const perimeterParams = patternParamsByPattern.perimeter
  const orbitParams = patternParamsByPattern.orbit
  const spiralParams = patternParamsByPattern.spiral
  const gridParams = patternParamsByPattern.grid
  const corridorParams = patternParamsByPattern.corridor
  const patternGenerationContext = useMemo(
    () => ({
      points,
      exclusionZones: enabledExclusionZones,
      paramsByPattern: patternParamsByPattern,
      waypointDensity,
    }),
    [enabledExclusionZones, patternParamsByPattern, points, waypointDensity],
  )
  const shouldBuildSelectedPatternMission =
    isPolygonValid && (stage === 'editing' || stage === 'generated')
  const shouldBuildBasePatternMission = isPolygonValid && stage === 'generated'
  const activePreviewMission = useMemo(
    () =>
      (stage === 'editing' || stage === 'generated') && isPolygonValid
        ? buildFlightPatternMission(activePreviewPattern, patternGenerationContext)
        : null,
    [activePreviewPattern, isPolygonValid, patternGenerationContext, stage],
  )
  const selectedPatternMission = useMemo(
    () =>
      shouldBuildSelectedPatternMission
        ? buildFlightPatternMission(selectedPattern, patternGenerationContext)
        : null,
    [patternGenerationContext, selectedPattern, shouldBuildSelectedPatternMission],
  )
  const displayPatternId =
    stage === 'generated' ? generatedPatternId ?? selectedPattern : selectedPattern
  const displayPatternMeta =
    stage === 'generated' ? generatedPatternMeta : selectedPatternMission?.meta ?? null
  const basePatternMission = useMemo(
    () =>
      shouldBuildBasePatternMission
        ? buildFlightPatternMission(displayPatternId, {
            points,
            exclusionZones: enabledExclusionZones,
            paramsByPattern: patternParamsByPattern,
            waypointDensity: DEFAULT_WAYPOINT_DENSITY_CONFIG,
          })
        : null,
    [
      displayPatternId,
      enabledExclusionZones,
      patternParamsByPattern,
      points,
      shouldBuildBasePatternMission,
    ],
  )
  const displayPatternSegments = useMemo(
    () => (stage === 'generated' ? generatedSegments : activePreviewMission?.segments ?? []),
    [activePreviewMission, generatedSegments, stage],
  )
  const generatedWaypoints = useMemo(
    () => selectedPatternMission?.waypoints ?? [],
    [selectedPatternMission],
  )
  const previewBatteryReport = useMemo(
    () =>
      stage === 'editing' && selectedPatternMission
        ? computeBatteryReport({
            droneProfile: resolvedDroneProfile,
            waypoints: selectedPatternMission.waypoints,
            homePoint,
            isClosedLoop: selectedPatternMission.closed,
            safetyPreset: resolvedSafetyPreset,
          })
        : null,
    [
      homePoint,
      resolvedDroneProfile,
      resolvedSafetyPreset,
      selectedPatternMission,
      stage,
    ],
  )
  const waypointInteractionModel = useMemo(
    () =>
      deriveWaypointInteractionModel({
        patternId: displayPatternId,
        waypoints,
        requestedStartWaypointId: startWaypointId,
        isClosedLoopOverride: stage === 'generated' ? generatedClosed : undefined,
      }),
    [displayPatternId, generatedClosed, stage, startWaypointId, waypoints],
  )
  const orderedWaypoints = waypointInteractionModel.orderedWaypoints
  const effectiveStartWaypointId = waypointInteractionModel.effectiveStartWaypointId
  const missionEndWaypointId = waypointInteractionModel.endWaypointId
  const isClosedMissionLoop = waypointInteractionModel.isClosedLoop
  const displayStartWaypointId = orderedWaypoints[0]?.id ?? null
  const displayEndWaypointId = isClosedMissionLoop
    ? displayStartWaypointId
    : missionEndWaypointId
  const canPreviewSimulationInEditing =
    stage === 'editing' && (selectedPatternMission?.waypoints.length ?? 0) > 1
  const canPreviewSimulationInGenerated =
    stage === 'generated' && orderedWaypoints.length > 1
  const area = useMemo(() => polygonArea(points), [points])
  const activeExclusionIssues = useMemo(
    () =>
      activeExclusionZone
        ? getExclusionZoneValidationIssues({
            zone: activeExclusionZone,
            boundaryPoints: points,
            otherZones: exclusionZones.filter((zone) => zone.id !== activeExclusionZone.id),
            lineSpacing,
          })
        : [],
    [activeExclusionZone, exclusionZones, lineSpacing, points],
  )
  const selectedWaypoint = useMemo(
    () => waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null,
    [selectedWaypointId, waypoints],
  )
  const generatedBatteryReport = useMemo(
    () =>
      orderedWaypoints.length > 0
        ? computeBatteryReport({
            droneProfile: resolvedDroneProfile,
            waypoints: orderedWaypoints,
            homePoint,
            isClosedLoop: isClosedMissionLoop,
            safetyPreset: resolvedSafetyPreset,
          })
        : null,
    [
      homePoint,
      isClosedMissionLoop,
      orderedWaypoints,
      resolvedDroneProfile,
      resolvedSafetyPreset,
    ],
  )
  const generatedDensityMetrics = useMemo(
    () =>
      computeWaypointDensityMetrics({
        anchors: generatedAnchorWaypoints,
        waypoints,
        pathSegments: generatedPathSegments,
        constraints: {
          minSpacing: 2,
          maxWaypoints: null,
        },
      }),
    [generatedAnchorWaypoints, generatedPathSegments, waypoints],
  )
  const generatedDensityConstraints = useMemo(
    () =>
      getWaypointDensityConstraints(
        displayPatternId,
        stage === 'generated' ? generatedClosed : false,
      ),
    [displayPatternId, generatedClosed, stage],
  )
  const generatedProtectedWaypointCount = useMemo(
    () =>
      getProtectedWaypointCount({
        anchors: generatedAnchorWaypoints,
        constraints: generatedDensityConstraints,
        protectActioned: waypointDensity.protectActioned !== false,
      }),
    [
      generatedAnchorWaypoints,
      generatedDensityConstraints,
      waypointDensity.protectActioned,
    ],
  )
  const generatedSimplifyFloor = useMemo(
    () =>
      getWaypointCountFloor({
        anchors: generatedAnchorWaypoints,
        constraints: generatedDensityConstraints,
        protectActioned: waypointDensity.protectActioned !== false,
      }),
    [
      generatedAnchorWaypoints,
      generatedDensityConstraints,
      waypointDensity.protectActioned,
    ],
  )
  const generatedDensityBaseCount = generatedDensityMetrics.anchorCount
  const originalAnchorWaypointCount =
    basePatternMission?.anchorWaypoints.length ?? generatedDensityBaseCount
  const generatedDensityCountFloor =
    waypointDensity.mode === 'simplify'
      ? generatedSimplifyFloor
      : generatedDensityMetrics.minimumCount
  const generatedDensityCountCeiling =
    waypointDensity.mode === 'simplify'
      ? Math.max(originalAnchorWaypointCount, generatedDensityCountFloor)
      : Math.max(
          generatedDensityMetrics.maximumCount ?? 0,
          generatedDensityMetrics.minimumCount * 3,
          generatedDensityMetrics.totalCount,
          waypointDensity.targetCount ?? generatedDensityMetrics.totalCount,
        )
  const densitySignature = useMemo(
    () => serializeWaypointDensityConfig(waypointDensity),
    [waypointDensity],
  )
  const generatedDensitySignature = useMemo(
    () =>
      generatedWaypointDensity
        ? serializeWaypointDensityConfig(generatedWaypointDensity)
        : null,
    [generatedWaypointDensity],
  )
  const isGeneratedDensityPending =
    stage === 'generated' &&
    generatedDensitySignature !== null &&
    densitySignature !== generatedDensitySignature
  const pendingDensityPreviewMission = useMemo(
    () =>
      stage === 'generated' && isGeneratedDensityPending ? selectedPatternMission : null,
    [isGeneratedDensityPending, selectedPatternMission, stage],
  )
  const selectedWaypointBatteryEstimate = useMemo(
    () =>
      selectedWaypoint && generatedBatteryReport
        ? generatedBatteryReport.waypointEstimates.find(
            (estimate) => estimate.waypointId === selectedWaypoint.id,
          ) ?? null
        : null,
    [generatedBatteryReport, selectedWaypoint],
  )
  const selectedWaypointActionEstimate = useMemo(
    () =>
      selectedWaypoint
        ? computeWaypointActionEnergy({
            actions: selectedWaypoint.actions,
            startAltitude: selectedWaypoint.z,
            droneProfile: resolvedDroneProfile,
          })
        : null,
    [resolvedDroneProfile, selectedWaypoint],
  )
  const selectedWaypointActionBreakdown = useMemo(
    () =>
      selectedWaypoint
        ? getWaypointActionCostBreakdown(selectedWaypoint, resolvedDroneProfile)
        : [],
    [resolvedDroneProfile, selectedWaypoint],
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
    () => {
      if (!selectedWaypoint) {
        return []
      }

      return [
        ...selectedWaypoint.actions.flatMap((action) => validateWaypointAction(action)),
        ...getWaypointValidationWarnings({
          waypoint: selectedWaypoint,
          effectiveStartWaypointId,
          missionEndWaypointId,
        }),
      ]
    },
    [effectiveStartWaypointId, missionEndWaypointId, selectedWaypoint],
  )
  const intermediateWaypointActionCount = useMemo(
    () => countIntermediateWaypointActions(waypoints),
    [waypoints],
  )
  const activeNotice =
    interactionNotice && stage !== 'idle' ? interactionNotice : null

  const radialMenuWaypoint = useMemo(
    () =>
      waypointRadialMenu
        ? waypoints.find((waypoint) => waypoint.id === waypointRadialMenu.waypointId) ??
          null
        : null,
    [waypointRadialMenu, waypoints],
  )
  const radialMenuActionTypes = useMemo(
    () =>
      new Set(
        radialMenuWaypoint?.actions.map((action) => action.type) ?? [],
      ),
    [radialMenuWaypoint],
  )
  const bulkAssignActionLabel = bulkAssignActionType
    ? getWaypointActionLabel(bulkAssignActionType)
    : null
  const drawingModeLabel =
    drawingTarget === 'exclusion'
      ? activeExclusionZone?.label ?? 'Excluded area'
      : selectedPatternOption.shortLabel
  const canRadialWaypointBeStart = useMemo(
    () =>
      radialMenuWaypoint
        ? canSetStartWaypoint(
            displayPatternId,
            radialMenuWaypoint.id,
            waypoints,
            stage === 'generated' ? generatedClosed : undefined,
          )
        : false,
    [displayPatternId, generatedClosed, radialMenuWaypoint, stage, waypoints],
  )
  const isRadialWaypointStart =
    radialMenuWaypoint !== null && radialMenuWaypoint.id === displayStartWaypointId
  const startWaypointOptions = useMemo(
    () =>
      getStartWaypointOptions({
        allowedStartWaypointIds: waypointInteractionModel.allowedStartWaypointIds,
        waypoints,
        isClosedLoop: isClosedMissionLoop,
      }),
    [
      isClosedMissionLoop,
      waypointInteractionModel.allowedStartWaypointIds,
      waypoints,
    ],
  )

  const clearPatternHoverTransition = useCallback(() => {
    if (patternHoverTransitionFrameRef.current !== null) {
      window.cancelAnimationFrame(patternHoverTransitionFrameRef.current)
      patternHoverTransitionFrameRef.current = null
    }
  }, [])

  const dismissPatternPicker = useCallback(() => {
    if (patternPickerDelayRef.current !== null) {
      window.clearTimeout(patternPickerDelayRef.current)
      patternPickerDelayRef.current = null
    }

    clearPatternHoverTransition()
    patternPickerDragCleanupRef.current?.()
    patternPickerDragCleanupRef.current = null
    patternPickerDragRef.current = null
    setPatternPickerVisible(false)
    setHoveredPattern(null)
    setPatternPickerManualPosition(null)
    setSimulationSession((current) =>
      current?.source === 'preview' ? null : current,
    )
  }, [clearPatternHoverTransition])

  function dismissWaypointRadialMenu() {
    setWaypointRadialMenu(null)
  }

  function requestSkipAnimation() {
    setSkipAnimationToken((current) => current + 1)
  }

  const issueSimulationCommand = useCallback((
    command: DroneSimulationCommandInput,
  ) => {
    simulationCommandTokenRef.current += 1
    setSimulationCommand({
      token: simulationCommandTokenRef.current,
      ...command,
    } as DroneSimulationCommand)
  }, [])

  function createSimulationSession(input: {
    source: DroneSimulationSession['source']
    mode: DroneSimulationSession['mode']
    patternId: FlightPatternId
    waypoints: MissionWaypoint[]
    isClosedLoop: boolean
  }): DroneSimulationSession {
    simulationSessionKeyRef.current += 1
    return {
      key: simulationSessionKeyRef.current,
      ...input,
    }
  }

  const stopSimulationSession = useCallback(() => {
    issueSimulationCommand({ type: 'stop' })
    setSimulationSession(null)
    setSimulationTelemetry(DEFAULT_DRONE_SIMULATION_TELEMETRY)
  }, [issueSimulationCommand])

  function startPreviewSimulationSession(
    patternId: FlightPatternId,
    mode: DroneSimulationSession['mode'],
  ) {
    const mission = buildFlightPatternMission(patternId, patternGenerationContext)

    if (!mission || mission.waypoints.length < 2) {
      return
    }

    setSimulationFollowCamera(true)
    setSimulationSession(
      createSimulationSession({
        source: 'preview',
        mode,
        patternId,
        waypoints: mission.waypoints,
        isClosedLoop: mission.closed,
      }),
    )
  }

  function startGeneratedSimulationSession(mode: DroneSimulationSession['mode']) {
    if (orderedWaypoints.length < 2) {
      return
    }

    setSimulationFollowCamera(true)
    setSimulationSession(
      createSimulationSession({
        source: 'generated',
        mode,
        patternId: displayPatternId,
        waypoints: orderedWaypoints,
        isClosedLoop: isClosedMissionLoop,
      }),
    )
  }

  function handlePreviewFlight() {
    if (stage === 'generated') {
      startGeneratedSimulationSession('one-shot')
      return
    }

    if (stage === 'editing') {
      startPreviewSimulationSession(selectedPattern, 'one-shot')
    }
  }

  function handleReviewPattern(patternId: FlightPatternId) {
    if (!patternPickerVisible) {
      return
    }

    clearPatternHoverTransition()

    const isActivePreviewLoop =
      simulationSession?.source === 'preview' && simulationSession.mode === 'loop'
    const isSwitchingPreviewPattern =
      isActivePreviewLoop && simulationSession.patternId !== patternId

    if (hoveredPattern === patternId && !isSwitchingPreviewPattern) {
      return
    }

    if (isSwitchingPreviewPattern) {
      setHoveredPattern(null)
      setSimulationSession((current) =>
        current?.source === 'preview' && current.mode === 'loop' ? null : current,
      )
      setSimulationTelemetry(DEFAULT_DRONE_SIMULATION_TELEMETRY)

      patternHoverTransitionFrameRef.current = window.requestAnimationFrame(() => {
        patternHoverTransitionFrameRef.current = null
        setHoveredPattern(patternId)
      })
      return
    }

    setHoveredPattern(patternId)
  }

  function schedulePatternPickerOpen() {
    if (patternPickerDelayRef.current !== null) {
      window.clearTimeout(patternPickerDelayRef.current)
    }

    patternPickerDelayRef.current = window.setTimeout(() => {
      setPatternPickerManualPosition(null)
      setPatternPickerVisible(true)
      patternPickerDelayRef.current = null
    }, 200)
  }

  useEffect(() => {
    const viewportStage = viewportStageRef.current

    if (!viewportStage) {
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) {
        return
      }

      setViewportStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(viewportStage)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!patternPickerVisible) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dismissPatternPicker()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dismissPatternPicker, patternPickerVisible])

  useEffect(() => {
    if (!patternPickerVisible || !patternPickerRef.current) {
      return undefined
    }

    const panelNode = patternPickerRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) {
        return
      }

      setPatternPickerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(panelNode)

    return () => {
      observer.disconnect()
    }
  }, [patternPickerVisible])

  useEffect(() => {
    if (!patternPickerVisible || stage === 'editing') {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      clearPatternHoverTransition()
      if (patternPickerDelayRef.current !== null) {
        window.clearTimeout(patternPickerDelayRef.current)
        patternPickerDelayRef.current = null
      }

      setPatternPickerVisible(false)
      setHoveredPattern(null)
      setSimulationSession((current) =>
        current?.source === 'preview' ? null : current,
      )
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [clearPatternHoverTransition, patternPickerVisible, stage])

  useEffect(() => {
    if (stage === 'idle' || stage === 'setup' || stage === 'drawing') {
      const frameId = window.requestAnimationFrame(() => {
        setSimulationSession(null)
        setSimulationTelemetry(DEFAULT_DRONE_SIMULATION_TELEMETRY)
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    return undefined
  }, [stage])

  useEffect(() => () => {
    clearPatternHoverTransition()
  }, [clearPatternHoverTransition])

  useEffect(() => {
    if (!simulationSession) {
      const frameId = window.requestAnimationFrame(() => {
        setSimulationTelemetry(DEFAULT_DRONE_SIMULATION_TELEMETRY)
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    return undefined
  }, [simulationSession])

  useEffect(() => {
    if (
      stage !== 'editing' ||
      !patternPickerVisible ||
      hoveredPattern === null ||
      !activePreviewMission ||
      activePreviewMission.waypoints.length < 2
    ) {
      const frameId = window.requestAnimationFrame(() => {
        setSimulationSession((current) =>
          current?.source === 'preview' && current.mode === 'loop' ? null : current,
        )
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    if (
      simulationSession?.source === 'preview' &&
      simulationSession.mode === 'one-shot'
    ) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setSimulationFollowCamera(true)
      setSimulationSession(
        createSimulationSession({
          source: 'preview',
          mode: 'loop',
          patternId: hoveredPattern,
          waypoints: activePreviewMission.waypoints,
          isClosedLoop: activePreviewMission.closed,
        }),
      )
    }, DRONE_SIMULATION_HOVER_START_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    activePreviewMission,
    hoveredPattern,
    patternPickerVisible,
    simulationSession?.mode,
    simulationSession?.source,
    stage,
  ])

  useEffect(() => {
    if (!simulationTelemetry.visible) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      const activeElement = document.activeElement
      const isTypingTarget =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement

      if (isTypingTarget) {
        return
      }

      if (event.key === ' ') {
        event.preventDefault()
        issueSimulationCommand({ type: 'toggle-play' })
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        stopSimulationSession()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        issueSimulationCommand({ type: 'seek-waypoint', direction: 'prev' })
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        issueSimulationCommand({ type: 'seek-waypoint', direction: 'next' })
        return
      }

      if (event.key === ']') {
        event.preventDefault()
        setSimulationSpeed((current) => getNextDroneSimulationSpeed(current))
        return
      }

      if (event.key === '[') {
        event.preventDefault()
        setSimulationSpeed((current) => {
          const speeds = [0.5, 1, 2, 4]
          const currentIndex = speeds.indexOf(current)
          if (currentIndex <= 0) {
            return speeds[speeds.length - 1]
          }
          return speeds[currentIndex - 1]
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [issueSimulationCommand, simulationTelemetry.visible, stopSimulationSession])

  useEffect(() => {
    if (!waypointRadialMenu) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dismissWaypointRadialMenu()
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (waypointRadialMenuRef.current?.contains(event.target as Node)) {
        return
      }

      dismissWaypointRadialMenu()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [waypointRadialMenu])

  useEffect(() => {
    return () => {
      if (patternPickerDelayRef.current !== null) {
        window.clearTimeout(patternPickerDelayRef.current)
      }

      patternPickerDragCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (actionEditorFocusToken === 0 || stage !== 'generated') {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      waypointActionEditorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [actionEditorFocusToken, stage])

  useEffect(() => {
    if (stage !== 'generated') {
      if (hoveredWaypointId !== null) {
        setHoveredWaypoint(null)
      }

      if (isBulkAssignActive(bulkAssignActionType)) {
        setBulkAssignActionType(null)
      }

      if (waypointRadialMenu) {
        const frameId = window.requestAnimationFrame(() => {
          dismissWaypointRadialMenu()
        })

        return () => {
          window.cancelAnimationFrame(frameId)
        }
      }
    }

    return undefined
  }, [
    bulkAssignActionType,
    hoveredWaypointId,
    setBulkAssignActionType,
    setHoveredWaypoint,
    stage,
    waypointRadialMenu,
  ])

  useEffect(() => {
    if (waypointRadialMenu && !radialMenuWaypoint) {
      const frameId = window.requestAnimationFrame(() => {
        dismissWaypointRadialMenu()
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    return undefined
  }, [radialMenuWaypoint, waypointRadialMenu])

  useEffect(() => {
    if (!isBulkAssignActive(bulkAssignActionType)) {
      previousSelectedPatternRef.current = selectedPattern
      return undefined
    }

    if (previousSelectedPatternRef.current === selectedPattern) {
      return undefined
    }

    previousSelectedPatternRef.current = selectedPattern
    setBulkAssignActionType(null)
    return undefined
  }, [
    bulkAssignActionType,
    selectedPattern,
    setBulkAssignActionType,
  ])

  useEffect(() => {
    if (!isBulkAssignActive(bulkAssignActionType)) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setBulkAssignActionType(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [bulkAssignActionType, setBulkAssignActionType])

  useEffect(() => {
    if (stage !== 'generated' || hoveredWaypointId === null) {
      return undefined
    }

    const container = behaviorListRef.current
    const row = waypointRowRefs.current.get(hoveredWaypointId)

    if (!container || !row) {
      return undefined
    }

    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const isAboveViewport = rowRect.top < containerRect.top + 8
    const isBelowViewport = rowRect.bottom > containerRect.bottom - 8

    if (!isAboveViewport && !isBelowViewport) {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      row.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [hoveredWaypointId, stage])

  useEffect(() => {
    if (stage !== 'generated' || selectedWaypointId === null) {
      return undefined
    }

    const container = behaviorListRef.current
    const row = waypointRowRefs.current.get(selectedWaypointId)

    if (!container || !row) {
      return undefined
    }

    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const isAboveViewport = rowRect.top < containerRect.top + 8
    const isBelowViewport = rowRect.bottom > containerRect.bottom - 8

    if (!isAboveViewport && !isBelowViewport) {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      row.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [selectedWaypointId, stage])

  useEffect(() => {
    if (
      stage !== 'generated' ||
      startWaypointId === null ||
      !waypointInteractionModel.didFallbackToAutoStart
    ) {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      setStartWaypoint(null)
      setInteractionNotice({
        tone: 'warning',
        message:
          'Start point reset to Waypoint 1 because the previous start no longer exists or is not valid for this path.',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [
    setStartWaypoint,
    stage,
    startWaypointId,
    waypointInteractionModel.didFallbackToAutoStart,
  ])

  useEffect(() => {
    if (viewportAnimationState !== 'animating') {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space') {
        return
      }

      event.preventDefault()
      requestSkipAnimation()
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [viewportAnimationState])

  useEffect(() => {
    if (scanAltitude !== activePatternParams.scanAltitude) {
      setScanAltitude(activePatternParams.scanAltitude)
    }

    if (
      (selectedPattern === 'coverage' || selectedPattern === 'grid') &&
      'lineSpacing' in activePatternParams &&
      lineSpacing !== activePatternParams.lineSpacing
    ) {
      setLineSpacing(activePatternParams.lineSpacing)
    }

    if (
      (selectedPattern === 'coverage' || selectedPattern === 'grid') &&
      'orientation' in activePatternParams &&
      orientation !== activePatternParams.orientation
    ) {
      setOrientation(activePatternParams.orientation)
    }
  }, [
    activePatternParams,
    lineSpacing,
    orientation,
    scanAltitude,
    selectedPattern,
    setLineSpacing,
    setOrientation,
    setScanAltitude,
  ])

  function clearInteractionNotice() {
    setInteractionNotice(null)
  }

  useEffect(() => {
    if (
      stage !== 'generated' ||
      !selectedPatternMission ||
      !generatedWaypointDensity ||
      generatedDensitySignature === null ||
      generatedDensitySignature === densitySignature
    ) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      if (selectedPatternMission.waypoints.length === 0) {
        editGeneratedPath()
        setInteractionNotice({
          tone: 'warning',
          message:
            'No valid route remains for the current waypoint density. Review the density settings and try again.',
        })
        return
      }

      if (intermediateWaypointActionCount > 0) {
        const confirmed = window.confirm(
          `Changing waypoint density will remove ${intermediateWaypointActionCount} action${
            intermediateWaypointActionCount > 1 ? 's' : ''
          } assigned to intermediate waypoints. Anchor actions will be preserved. Continue?`,
        )

        if (!confirmed) {
          setWaypointDensityConfig(generatedWaypointDensity)
          setInteractionNotice({
            tone: 'warning',
            message:
              'Waypoint density change was cancelled so intermediate waypoint actions are preserved.',
          })
          return
        }
      }

      const migratedMission = migrateAnchorActionsToDensityMission(
        waypoints,
        selectedPatternMission,
      )

      generateMissionPath(migratedMission, waypointDensity)

      if (intermediateWaypointActionCount > 0) {
        setInteractionNotice({
          tone: 'warning',
          message: `${intermediateWaypointActionCount} intermediate waypoint action${
            intermediateWaypointActionCount > 1 ? 's were' : ' was'
          } cleared during density update. Anchor actions were preserved.`,
        })
        return
      }

      clearInteractionNotice()
    }, 150)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    densitySignature,
    editGeneratedPath,
    generateMissionPath,
    generatedDensitySignature,
    generatedWaypointDensity,
    intermediateWaypointActionCount,
    setWaypointDensityConfig,
    selectedPatternMission,
    stage,
    waypointDensity,
    waypoints,
  ])

  function updatePatternParams<K extends FlightPatternId>(
    patternId: K,
    patch: Partial<PatternParamsMap[K]>,
  ) {
    setPatternParamsByPattern((current) => {
      const nextParams = clampPatternParams(patternId, {
        ...current[patternId],
        ...patch,
      } as PatternParamsMap[K])

      return {
        ...current,
        [patternId]: nextParams,
      }
    })
  }

  function updateSelectedPatternScanAltitude(value: number) {
    switch (selectedPattern) {
      case 'coverage':
        updatePatternParams('coverage', { scanAltitude: value })
        break
      case 'perimeter':
        updatePatternParams('perimeter', { scanAltitude: value })
        break
      case 'orbit':
        updatePatternParams('orbit', { scanAltitude: value })
        break
      case 'spiral':
        updatePatternParams('spiral', { scanAltitude: value })
        break
      case 'grid':
        updatePatternParams('grid', { scanAltitude: value })
        break
      case 'corridor':
        updatePatternParams('corridor', { scanAltitude: value })
        break
    }
  }

  function handleAddPoint(x: number, y: number) {
    if (!canAppendPointToOpenPath(activeDrawingPoints, { x, y })) {
      setInteractionNotice({
        tone: 'danger',
        message:
          drawingTarget === 'exclusion'
            ? 'Excluded area cannot cross itself. Keep the shape simple and non-overlapping.'
            : 'Path cannot cross itself. Place the next point along the outer boundary.',
      })
      return
    }

    clearInteractionNotice()
    addPoint(x, y)
  }

  function handleUpdatePoint(id: number, x: number, y: number) {
    const candidate = activeDrawingPoints.map((point) =>
      point.id === id ? { ...point, x, y } : point,
    )

    if (!isSimplePolygon(candidate)) {
      setInteractionNotice({
        tone: 'danger',
        message:
          drawingTarget === 'exclusion'
            ? 'Excluded area must stay a simple polygon. This move would create crossing edges.'
            : 'Polygon fill needs a simple boundary. This move would create crossing edges.',
      })
      return
    }

    clearInteractionNotice()
    updatePoint(id, x, y)
  }

  function handleClosePolygon() {
    if (!isActiveDrawingPolygonValid) {
      setInteractionNotice({
        tone: 'danger',
        message:
          drawingTarget === 'exclusion'
            ? 'Close the excluded area with a non-crossing boundary before continuing.'
            : 'Close the area with a non-crossing boundary before continuing.',
      })
      return
    }

    const closingExclusionZoneId =
      drawingTarget === 'exclusion' ? activeExclusionZoneId : null

    clearInteractionNotice()
    closePolygon()

    if (closingExclusionZoneId !== null) {
      setActiveExclusionZone(closingExclusionZoneId)
      return
    }

    schedulePatternPickerOpen()
  }

  function handleGeneratePath() {
    if (!selectedPatternOption.implemented) {
      setInteractionNotice({
        tone: 'warning',
        message: `${selectedPatternOption.shortLabel} preview is available, but full generation is not built yet.`,
      })
      return
    }

    if (!selectedPatternMission || !isPolygonValid || generatedWaypoints.length === 0) {
      setInteractionNotice({
        tone: 'warning',
        message:
          enabledExclusionZones.length > 0
            ? 'No valid route remains after applying the excluded areas.'
            : 'Mission path is only available after the polygon boundary is valid.',
      })
      return
    }

    clearInteractionNotice()
    generateMissionPath(selectedPatternMission, waypointDensity)
  }

  function handleResetMission() {
    dismissPatternPicker()
    dismissWaypointRadialMenu()
    clearInteractionNotice()
    setSelectedPattern('coverage')
    setPatternParamsByPattern(createInitialPatternParams())
    setPatternPickerAnchor(null)
    resetMission()
  }

  function handleRedrawMission() {
    dismissPatternPicker()
    dismissWaypointRadialMenu()
    clearInteractionNotice()
    setActiveExclusionZone(null)
    redrawMission()
  }

  function handleAddExclusionZone() {
    dismissPatternPicker()
    dismissWaypointRadialMenu()
    setInteractionNotice(
      stage === 'generated'
        ? {
            tone: 'warning',
            message:
              'Mission changed. Draw the excluded area, then generate the path again to apply it.',
          }
        : null,
    )
    addExclusionZone()
  }

  function handleDeleteExclusionZone(zone: ExclusionZone) {
    if (!window.confirm(`Delete "${zone.label}"?`)) {
      return
    }

    setInteractionNotice(
      stage === 'generated'
        ? {
            tone: 'warning',
            message: 'Mission changed. Review the updated region and generate path again.',
          }
        : null,
    )
    removeExclusionZone(zone.id)
  }

  function handleToggleExclusionZone(zoneId: number) {
    setInteractionNotice(
      stage === 'generated'
        ? {
            tone: 'warning',
            message: 'Mission changed. Review the updated region and generate path again.',
          }
        : null,
    )
    toggleExclusionZone(zoneId)
  }

  function handleWaypointDensityModeChange(
    mode: 'auto' | 'count' | 'spacing' | 'simplify',
  ) {
    setWaypointDensityMode(mode)

    if (mode === 'count') {
      setTargetWaypointCount(
        Math.max(
          originalAnchorWaypointCount,
          waypointDensity.targetCount ?? generatedDensityMetrics.totalCount,
        ),
      )
      return
    }

    if (mode === 'simplify') {
      const requestedCount = waypointDensity.targetCount ?? generatedDensityMetrics.totalCount

      setTargetWaypointCount(
        Math.max(
          generatedDensityCountFloor,
          Math.min(requestedCount, originalAnchorWaypointCount),
        ),
      )
    }
  }

  function handleWaypointDensityCountChange(value: number) {
    if (!Number.isFinite(value)) {
      return
    }

    const clampedValue =
      waypointDensity.mode === 'simplify'
        ? Math.min(value, generatedDensityCountCeiling)
        : generatedDensityMetrics.maximumCount !== null
          ? Math.min(value, generatedDensityMetrics.maximumCount)
          : value

    setTargetWaypointCount(
      Math.max(generatedDensityCountFloor, clampedValue),
    )
  }

  function handleWaypointDensitySpacingChange(value: number) {
    if (!Number.isFinite(value)) {
      return
    }

    setTargetWaypointSpacing(Math.max(2, value))
  }

  function handleResetWaypointDensity() {
    setWaypointDensityConfig({
      ...DEFAULT_WAYPOINT_DENSITY_CONFIG,
    })
    clearInteractionNotice()
  }

  function handleSelectPattern(patternId: FlightPatternId) {
    const nextPattern = getFlightPatternOption(patternId)
    clearPatternHoverTransition()
    setSelectedPattern(patternId)
    dismissPatternPicker()

    if (nextPattern.implemented) {
      window.requestAnimationFrame(() => {
        startPreviewSimulationSession(patternId, 'one-shot')
      })
    }

    setInteractionNotice(
      nextPattern.implemented
        ? null
        : {
            tone: 'warning',
            message: `${nextPattern.shortLabel} is wired for popup selection and preview, but generator logic is still pending.`,
          },
    )
  }

  function handleResetPatternPickerPosition() {
    setPatternPickerManualPosition(null)
  }

  function handlePatternPickerDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !patternPickerPosition ||
      !viewportStageRef.current ||
      (event.target instanceof HTMLElement && event.target.closest('button'))
    ) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const viewportRect = viewportStageRef.current.getBoundingClientRect()

    patternPickerDragCleanupRef.current?.()

    patternPickerDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - viewportRect.left - patternPickerPosition.left,
      offsetY: event.clientY - viewportRect.top - patternPickerPosition.top,
      width: patternPickerPosition.width,
      height: patternPickerSize.height,
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      const dragState = patternPickerDragRef.current
      const viewportRect = viewportStageRef.current?.getBoundingClientRect()

      if (
        !dragState ||
        dragState.pointerId !== moveEvent.pointerId ||
        !viewportRect
      ) {
        return
      }

      const nextPosition = clampOverlayPanelPosition(
        {
          x: moveEvent.clientX - viewportRect.left - dragState.offsetX,
          y: moveEvent.clientY - viewportRect.top - dragState.offsetY,
        },
        {
          width: dragState.width,
          height: dragState.height,
        },
        viewportStageSize,
      )

      setPatternPickerManualPosition({
        x: nextPosition.left,
        y: nextPosition.top,
      })
    }

    function handlePointerUp(upEvent: PointerEvent) {
      const dragState = patternPickerDragRef.current

      if (!dragState || dragState.pointerId !== upEvent.pointerId) {
        return
      }

      patternPickerDragRef.current = null
      cleanupDragListeners()
    }

    function cleanupDragListeners() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      patternPickerDragCleanupRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    patternPickerDragCleanupRef.current = cleanupDragListeners
  }

  function handleWaypointContextMenu({
    waypointId,
    clientX,
    clientY,
  }: WaypointContextMenuRequest) {
    const bounds = viewportStageRef.current?.getBoundingClientRect()

    if (!bounds) {
      return
    }

    selectWaypoint(waypointId)

    setWaypointRadialMenu({
      waypointId,
      anchor: {
        x: clientX - bounds.left,
        y: clientY - bounds.top,
      },
    })
  }

  function handleQuickAddWaypointAction(
    type: MissionWaypointActionType,
    enableBulkAssign = false,
  ) {
    if (!radialMenuWaypoint) {
      return
    }

    if (enableBulkAssign) {
      clearInteractionNotice()
      setPendingActionType(type)
      setBulkAssignActionType(type)
      dismissWaypointRadialMenu()
      return
    }

    setPendingActionType(type)
    addWaypointAction(radialMenuWaypoint.id, type)
    selectWaypoint(radialMenuWaypoint.id)
    dismissWaypointRadialMenu()
    setActionEditorFocusToken((current) => current + 1)
  }

  function handleApplyBulkAssign(waypointId: number) {
    if (!bulkAssignActionType) {
      return
    }

    clearInteractionNotice()
    addWaypointAction(waypointId, bulkAssignActionType)
    setHoveredWaypoint(waypointId)
  }

  function handleSetStartWaypointSelection(
    waypointId: number | null,
    origin: 'sidebar' | 'radial',
  ) {
    if (waypointId === null) {
      clearInteractionNotice()
      setStartWaypoint(null)

      if (origin === 'radial') {
        dismissWaypointRadialMenu()
      }

      return
    }

    if (
      !canSetStartWaypoint(
        displayPatternId,
        waypointId,
        waypoints,
        stage === 'generated' ? generatedClosed : undefined,
      )
    ) {
      setInteractionNotice({
        tone: 'warning',
        message: getBlockedStartWaypointMessage(isClosedMissionLoop),
      })

      if (origin === 'radial') {
        dismissWaypointRadialMenu()
      }

      return
    }

    clearInteractionNotice()
    setStartWaypoint(waypointId)
    selectWaypoint(waypointId)

    if (origin === 'radial') {
      dismissWaypointRadialMenu()
    }
  }

  function handleStartWaypointDropdownChange(value: string) {
    if (value === 'auto') {
      handleSetStartWaypointSelection(null, 'sidebar')
      return
    }

    const nextWaypointId = Number(value)

    if (Number.isNaN(nextWaypointId)) {
      return
    }

    handleSetStartWaypointSelection(nextWaypointId, 'sidebar')
  }

  const viewportHint = activeNotice?.message
    ? activeNotice.message
    : bulkAssignActionLabel
      ? `Bulk assign: ${bulkAssignActionLabel} · click waypoint to apply · Esc or right-click to exit`
    : viewportAnimationState === 'animating'
      ? 'Animating path preview · click or press Space to skip'
      : stage === 'setup'
      ? 'Tap highlighted altitude plane to place first point'
      : stage === 'drawing'
        ? drawingTarget === 'exclusion'
          ? isReadyToClose
            ? 'Click to close excluded area'
            : 'Click first point to close excluded area'
          : stage === 'drawing' && isReadyToClose
            ? 'Click to close polygon'
            : 'Click first point to close polygon'
      : stage === 'editing'
          ? patternPickerVisible
            ? hoveredPatternOption
              ? `Previewing ${hoveredPatternOption.label}`
              : 'Choose a flight pattern for this region'
            : 'Click & drag points to adjust position'
          : stage === 'generated'
            ? 'Generated path ready · select waypoint to inspect'
            : null
  const patternPickerAutoPosition = getDefaultPatternPickerPosition(viewportStageSize)
  const patternPickerPosition =
    patternPickerAutoPosition === null
      ? null
      : patternPickerManualPosition
        ? {
            ...clampOverlayPanelPosition(
              patternPickerManualPosition,
              {
                width: patternPickerAutoPosition.width,
                height: patternPickerSize.height,
              },
              viewportStageSize,
            ),
            width: patternPickerAutoPosition.width,
            placement: patternPickerAutoPosition.placement,
          }
        : patternPickerAutoPosition
  const waypointRadialMenuPosition = getWaypointRadialMenuPosition(
    waypointRadialMenu?.anchor ?? null,
    viewportStageSize,
  )
  const viewportHintClassName = `viewport-hint ${
    activeNotice
      ? `is-${activeNotice.tone}`
      : bulkAssignActionLabel
        ? 'is-bulk'
        : ''
  }`

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
            ref={viewportStageRef}
            className={`viewport-stage ${
              stage === 'setup' || stage === 'drawing' ? 'is-drawing' : ''
            } ${stage === 'drawing' && isReadyToClose ? 'is-ready-to-close' : ''} ${
              stage === 'drawing' && drawingTarget === 'exclusion'
                ? 'is-exclusion-drawing'
                : ''
            }`}
            onContextMenu={(event) => {
              if (isBulkAssignActive(bulkAssignActionType)) {
                event.preventDefault()
                setBulkAssignActionType(null)
                return
              }

              if (stage === 'generated' || waypointRadialMenu) {
                event.preventDefault()
              }
            }}
          >
            {viewportHint && (
              <div className={viewportHintClassName}>
                <span className="hint-dot" />
                {viewportHint}
              </div>
            )}

            <MissionViewport3D
              stage={stage}
              scanAltitude={scanAltitude}
              points={points}
              exclusionZones={exclusionZones}
              activeExclusionZoneId={activeExclusionZoneId}
              drawingTarget={drawingTarget}
              drawingPoints={activeDrawingPoints}
              patternSegments={displayPatternSegments}
              waypoints={orderedWaypoints}
              pendingDensityPreviewWaypoints={
                waypointDensity.mode === 'simplify'
                  ? pendingDensityPreviewMission?.waypoints ?? null
                  : null
              }
              pendingDensityPreviewAnchorWaypoints={
                waypointDensity.mode === 'simplify'
                  ? pendingDensityPreviewMission?.anchorWaypoints ?? null
                  : null
              }
              batteryReport={generatedBatteryReport}
              selectedWaypointId={selectedWaypointId}
              isClosedLoopMission={isClosedMissionLoop}
              selectedPattern={displayPatternId}
              hoveredPattern={hoveredPattern}
              patternPickerVisible={patternPickerVisible}
              waypointContextMenuVisible={waypointRadialMenu !== null}
              hoveredWaypointId={hoveredWaypointId}
              bulkAssignActionType={bulkAssignActionType}
              simulationSession={simulationSession}
              simulationCommand={simulationCommand}
              simulationSpeed={simulationSpeed}
              simulationFollowCamera={simulationFollowCamera}
              skipAnimationToken={skipAnimationToken}
              onStartDrawing={startDrawing}
              onAddPoint={handleAddPoint}
              onUpdatePoint={handleUpdatePoint}
              onClosePolygon={handleClosePolygon}
              onSelectWaypoint={selectWaypoint}
              onUpdateWaypointPosition={updateWaypointPosition}
              onBulkAssignWaypoint={handleApplyBulkAssign}
              onExitBulkAssign={() => setBulkAssignActionType(null)}
              onReadyToCloseChange={setIsReadyToClose}
              onPatternPickerAnchorChange={setPatternPickerAnchor}
              onAnimationStateChange={setViewportAnimationState}
              onSimulationTelemetryChange={setSimulationTelemetry}
              onCameraDebugChange={setCameraDebugSnapshot}
              onHoveredWaypointChange={setHoveredWaypoint}
              onWaypointContextMenu={handleWaypointContextMenu}
              onSelectExclusionZone={setActiveExclusionZone}
            />

            {(canPreviewSimulationInEditing || canPreviewSimulationInGenerated) && (
              <button
                type="button"
                className="viewport-preview-flight"
                onClick={handlePreviewFlight}
              >
                <Play size={14} strokeWidth={2.2} />
                Preview Flight
              </button>
            )}

            {cameraDebugSnapshot && (
              <div className="camera-debug-panel" aria-live="off">
                <div className="camera-debug-panel__title">Camera Debug</div>
                <div className="camera-debug-panel__row">
                  <span>pos</span>
                  <strong>{formatCameraDebugVector(cameraDebugSnapshot.position)}</strong>
                </div>
                <div className="camera-debug-panel__row">
                  <span>target</span>
                  <strong>{formatCameraDebugVector(cameraDebugSnapshot.target)}</strong>
                </div>
                <div className="camera-debug-panel__row">
                  <span>distance</span>
                  <strong>{formatCameraDebugValue(cameraDebugSnapshot.distance)}</strong>
                </div>
                <div className="camera-debug-panel__row">
                  <span>polar</span>
                  <strong>{formatCameraDebugValue(cameraDebugSnapshot.polarDeg, 1)}deg</strong>
                </div>
                <div className="camera-debug-panel__row">
                  <span>azimuth</span>
                  <strong>{formatCameraDebugValue(cameraDebugSnapshot.azimuthDeg, 1)}deg</strong>
                </div>
                <div className="camera-debug-panel__row">
                  <span>fov</span>
                  <strong>{formatCameraDebugValue(cameraDebugSnapshot.fov, 1)}</strong>
                </div>
              </div>
            )}

            {viewportAnimationState === 'animating' && (
              <button
                type="button"
                className="viewport-skip-overlay"
                onClick={requestSkipAnimation}
              >
                <span className="viewport-skip-chip">
                  Skip animation
                  <small>Click anywhere or press Space</small>
                </span>
              </button>
            )}

            <DroneSimulationPlaybackBar
              telemetry={simulationTelemetry}
              speedLabel={`${simulationSpeed}x`}
              isFollowEnabled={simulationFollowCamera}
              onTogglePlay={() => issueSimulationCommand({ type: 'toggle-play' })}
              onReplay={() => {
                if (simulationSession?.source === 'generated') {
                  startGeneratedSimulationSession('one-shot')
                  return
                }

                if (simulationSession?.patternId) {
                  startPreviewSimulationSession(simulationSession.patternId, 'one-shot')
                }
              }}
              onSeekPrev={() =>
                issueSimulationCommand({ type: 'seek-waypoint', direction: 'prev' })
              }
              onSeekNext={() =>
                issueSimulationCommand({ type: 'seek-waypoint', direction: 'next' })
              }
              onCycleSpeed={() =>
                setSimulationSpeed((current) => getNextDroneSimulationSpeed(current))
              }
              onToggleFollow={() =>
                setSimulationFollowCamera((current) => !current)
              }
              onStop={stopSimulationSession}
              onScrub={(progress) =>
                issueSimulationCommand({ type: 'seek-progress', progress })
              }
            />

            {patternPickerVisible && patternPickerPosition && (
              <div
                ref={patternPickerRef}
                className={`pattern-picker ${
                  patternPickerPosition.placement === 'below' ? 'is-below' : ''
                }`}
                style={{
                  left: `${patternPickerPosition.left}px`,
                  top: `${patternPickerPosition.top}px`,
                  width: `${patternPickerPosition.width}px`,
                }}
              >
                <div className="pattern-picker-header">
                  <div
                    className="pattern-picker-heading pattern-picker-drag-handle"
                    onPointerDown={handlePatternPickerDragStart}
                  >
                    <div className="pattern-picker-title">
                      <strong>Flight Pattern Picker</strong>
                      <span>Drag this header to reposition the picker.</span>
                    </div>
                    <div className="pattern-picker-actions">
                      <button
                        type="button"
                        className="pattern-picker-hide"
                        onClick={handleResetPatternPickerPosition}
                        disabled={patternPickerManualPosition === null}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="pattern-picker-hide"
                        onClick={dismissPatternPicker}
                      >
                        Hide
                      </button>
                    </div>
                </div>
                  <span>
                    Hover to review a flight pattern, drag the canvas to inspect it,
                    then click to choose and continue.
                  </span>
                </div>

                <div className="pattern-picker-list">
                  {FLIGHT_PATTERN_OPTIONS.map((pattern) => (
                    <button
                      key={pattern.id}
                      type="button"
                      className={`pattern-tile ${
                        selectedPattern === pattern.id ? 'is-selected' : ''
                      } ${reviewedPatternId === pattern.id ? 'is-previewing' : ''}`}
                      onMouseEnter={() => handleReviewPattern(pattern.id)}
                      onFocus={() => handleReviewPattern(pattern.id)}
                      onClick={() => handleSelectPattern(pattern.id)}
                    >
                      <span
                        className="pattern-tile-glyph"
                        style={{ color: pattern.color }}
                      >
                        {getPatternGlyph(pattern.id)}
                      </span>
                      <span className="pattern-tile-copy">
                        <strong>{pattern.label}</strong>
                        <span>{pattern.description}</span>
                      </span>
                      <span className="pattern-tile-meta">
                        {reviewedPatternId === pattern.id && (
                          <span className="pattern-preview-chip">Reviewing</span>
                        )}
                        {!pattern.implemented && (
                          <span className="pattern-soon-chip">Preview</span>
                        )}
                        <ChevronRight size={14} strokeWidth={2.2} />
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="pattern-picker-footer"
                  onClick={dismissPatternPicker}
                >
                  Hide picker
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>
            )}

            {waypointRadialMenu &&
              waypointRadialMenuPosition &&
              radialMenuWaypoint && (
                <div
                  ref={waypointRadialMenuRef}
                  className="waypoint-radial-menu"
                  style={{
                    left: `${waypointRadialMenuPosition.left}px`,
                    top: `${waypointRadialMenuPosition.top}px`,
                  }}
                >
                  <button
                    type="button"
                    className={`waypoint-radial-core ${
                      isRadialWaypointStart ? 'is-active' : ''
                    } ${!canRadialWaypointBeStart ? 'is-disabled' : ''}`}
                    onClick={() =>
                      handleSetStartWaypointSelection(radialMenuWaypoint.id, 'radial')
                    }
                    title={
                      canRadialWaypointBeStart
                        ? isClosedMissionLoop
                          ? 'Rotate mission loop to start from this waypoint'
                          : 'Use this endpoint as the mission start'
                        : getBlockedStartWaypointMessage(isClosedMissionLoop)
                    }
                  >
                    <strong>
                      {isRadialWaypointStart
                        ? `Start WP ${radialMenuWaypoint.id}`
                        : `WP ${radialMenuWaypoint.id}`}
                    </strong>
                    <span>
                      {isRadialWaypointStart
                        ? 'Mission entry'
                        : canRadialWaypointBeStart
                          ? isClosedMissionLoop
                            ? 'Set loop start'
                            : 'Set as start'
                          : 'Use path ends'}
                    </span>
                  </button>

                  {getWaypointRadialItems().map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      className="waypoint-radial-item"
                      style={{
                        left: `${item.x}%`,
                        top: `${item.y}%`,
                      }}
                      onClick={(event) =>
                        handleQuickAddWaypointAction(item.type, event.shiftKey)
                      }
                      title={item.description}
                    >
                      <span className="waypoint-radial-icon">
                        {renderWaypointActionIcon(item.type)}
                      </span>
                      <span className="waypoint-radial-label">{item.shortLabel}</span>
                      {radialMenuActionTypes.has(item.type) && (
                        <span className="waypoint-radial-dot" />
                      )}
                    </button>
                  ))}
                </div>
              )}

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
            <button type="button" className="button button-secondary" onClick={handleResetMission}>
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
                  <h2>{selectedPatternOption.shortLabel}</h2>
                  <p>{selectedPatternOption.description}</p>
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
                  <span>{selectedPatternOption.shortLabel}</span>
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

                <DroneProfileSelector
                  droneProfileId={droneProfileId}
                  safetyPresetId={safetyPresetId}
                  droneProfiles={DRONE_PRESETS}
                  safetyPresets={SAFETY_PRESETS}
                  resolvedDroneProfile={resolvedDroneProfile}
                  maxFlightMinutes={theoreticalFlightMinutes}
                  onDroneProfileChange={setDroneProfileId}
                  onSafetyPresetChange={setSafetyPresetId}
                />

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
                  <span>
                    {drawingTarget === 'exclusion'
                      ? `Drawing ${drawingModeLabel}`
                      : `Drawing ${selectedPatternOption.shortLabel}`}
                  </span>
                </div>

                <div className="stat-strip">
                  <div className="stat-pill">Alt {scanAltitude}m</div>
                  <div className="stat-pill">Pts {activeDrawingPoints.length}</div>
                </div>

                <div className="hint-card">
                  <span className="hint-icon">✦</span>
                  {activeNotice?.message ??
                    (drawingTarget === 'exclusion'
                      ? isReadyToClose
                        ? 'Click để đóng vùng loại trừ'
                        : 'Click first point to close excluded area'
                      : isReadyToClose
                        ? 'Click để đóng vùng'
                        : 'Click first point to close polygon')}
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
                  <span>{selectedPatternOption.shortLabel}</span>
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

                {previewBatteryReport && (
                  <div
                    className={`quick-estimate-card ${
                      previewBatteryReport.isFeasible ? 'is-feasible' : 'is-critical'
                    }`}
                  >
                    <div className="quick-estimate-top">
                      <strong>
                        {previewBatteryReport.isFeasible
                          ? `Estimated feasible (~${Math.round(
                              previewBatteryReport.batteryUsedPercent,
                            )}% battery budget)`
                          : `Likely over budget (~${Math.round(
                              previewBatteryReport.batteryUsedPercent,
                            )}% battery budget)`}
                      </strong>
                      <span>{selectedPatternOption.shortLabel}</span>
                    </div>
                    <span className="quick-estimate-meta">
                      ~{Math.round(previewBatteryReport.totalDistanceM)}m path ·{' '}
                      {formatDurationShort(previewBatteryReport.totalMissionTimeSec)} nominal
                      mission time
                    </span>
                    <span className="quick-estimate-footnote">
                      Estimate only. Actions and real conditions can change this result.
                    </span>
                  </div>
                )}

                {activeNotice && (
                  <div className="validation-card">
                    <span className="validation-card-dot" />
                    <span>{activeNotice.message}</span>
                  </div>
                )}

                <div className="vertices-card">
                  <div className="vertices-header">
                    <span>{drawingTarget === 'exclusion' ? 'Zone vertices' : 'Vertices'}</span>
                    <small>drag in 3D to move</small>
                  </div>

                  <div className="vertices-list">
                    {activeDrawingPoints.map((point) => (
                      <VertexRow key={point.id} point={point} />
                    ))}
                  </div>
                </div>

                <ExclusionZoneSection
                  zones={exclusionZones}
                  activeZoneId={activeExclusionZoneId}
                  activeIssues={activeExclusionIssues}
                  stage={stage}
                  onAddZone={handleAddExclusionZone}
                  onSelectZone={setActiveExclusionZone}
                  onRenameZone={renameExclusionZone}
                  onToggleZone={handleToggleExclusionZone}
                  onDeleteZone={handleDeleteExclusionZone}
                />

                <SliderField
                  id="phase2-altitude"
                  label="Scan Altitude"
                  min={20}
                  max={200}
                  step={1}
                  value={activePatternParams.scanAltitude}
                  valueLabel={`${activePatternParams.scanAltitude}m`}
                  onChange={updateSelectedPatternScanAltitude}
                />

                {selectedPattern === 'coverage' ? (
                  <>
                    <SliderField
                      id="phase2-spacing"
                      label="Line Spacing"
                      min={5}
                      max={50}
                      step={1}
                      value={coverageParams.lineSpacing}
                      valueLabel={`${coverageParams.lineSpacing}m`}
                      onChange={(value) =>
                        updatePatternParams('coverage', { lineSpacing: value })
                      }
                    />

                    <SliderField
                      id="phase2-orientation"
                      label="Orientation"
                      min={-180}
                      max={180}
                      step={1}
                      value={coverageParams.orientation}
                      valueLabel={`${coverageParams.orientation}°`}
                      onChange={(value) =>
                        updatePatternParams('coverage', { orientation: value })
                      }
                    />
                  </>
                ) : selectedPattern === 'perimeter' ? (
                  <>
                    <SliderField
                      id="perimeter-inset"
                      label="Inset Distance"
                      min={0}
                      max={30}
                      step={1}
                      value={perimeterParams.insetDistance}
                      valueLabel={`${perimeterParams.insetDistance}m`}
                      onChange={(value) =>
                        updatePatternParams('perimeter', { insetDistance: value })
                      }
                    />

                    <SliderField
                      id="perimeter-loops"
                      label="Loops"
                      min={1}
                      max={5}
                      step={1}
                      value={perimeterParams.loops}
                      valueLabel={`${perimeterParams.loops}`}
                      onChange={(value) =>
                        updatePatternParams('perimeter', { loops: value })
                      }
                    />

                    <SelectField
                      label="Direction"
                      value={perimeterParams.direction}
                      onChange={(value) =>
                        updatePatternParams('perimeter', {
                          direction: value as 'cw' | 'ccw',
                        })
                      }
                      options={[
                        { value: 'cw', label: 'Clockwise' },
                        { value: 'ccw', label: 'Counter-clockwise' },
                      ]}
                    />
                  </>
                ) : selectedPattern === 'orbit' ? (
                  <>
                    <SelectField
                      label="Center Mode"
                      value={orbitParams.centerMode}
                      onChange={(value) =>
                        updatePatternParams('orbit', {
                          centerMode: value as OrbitPatternParams['centerMode'],
                        })
                      }
                      options={[
                        { value: 'auto', label: 'Auto centroid' },
                        { value: 'manual', label: 'Manual X / Y' },
                      ]}
                    />

                    {orbitParams.centerMode === 'manual' && (
                      <PatternFieldGrid>
                        <NumberField
                          label="Center X"
                          value={orbitParams.manualCenter.x}
                          min={WORLD_BOUNDS.minX}
                          max={WORLD_BOUNDS.maxX}
                          step={1}
                          suffix="m"
                          onChange={(value) =>
                            updatePatternParams('orbit', {
                              manualCenter: {
                                ...orbitParams.manualCenter,
                                x: value,
                              },
                            })
                          }
                        />
                        <NumberField
                          label="Center Y"
                          value={orbitParams.manualCenter.y}
                          min={WORLD_BOUNDS.minY}
                          max={WORLD_BOUNDS.maxY}
                          step={1}
                          suffix="m"
                          onChange={(value) =>
                            updatePatternParams('orbit', {
                              manualCenter: {
                                ...orbitParams.manualCenter,
                                y: value,
                              },
                            })
                          }
                        />
                      </PatternFieldGrid>
                    )}

                    <SelectField
                      label="Radius Mode"
                      value={orbitParams.radiusMode}
                      onChange={(value) =>
                        updatePatternParams('orbit', {
                          radiusMode: value as OrbitPatternParams['radiusMode'],
                        })
                      }
                      options={[
                        { value: 'auto-fit', label: 'Auto-fit polygon' },
                        { value: 'manual', label: 'Manual radius' },
                      ]}
                    />

                    {orbitParams.radiusMode === 'manual' && (
                      <SliderField
                        id="orbit-radius"
                        label="Radius"
                        min={10}
                        max={200}
                        step={1}
                        value={orbitParams.radius}
                        valueLabel={`${orbitParams.radius}m`}
                        onChange={(value) =>
                          updatePatternParams('orbit', { radius: value })
                        }
                      />
                    )}

                    <SliderField
                      id="orbit-waypoints"
                      label="Waypoint Count"
                      min={8}
                      max={72}
                      step={1}
                      value={orbitParams.waypointCount}
                      valueLabel={`${orbitParams.waypointCount}`}
                      onChange={(value) =>
                        updatePatternParams('orbit', { waypointCount: value })
                      }
                    />

                    <SliderField
                      id="orbit-loops"
                      label="Loops"
                      min={1}
                      max={5}
                      step={1}
                      value={orbitParams.loops}
                      valueLabel={`${orbitParams.loops}`}
                      onChange={(value) =>
                        updatePatternParams('orbit', { loops: value })
                      }
                    />

                    <SelectField
                      label="Direction"
                      value={orbitParams.direction}
                      onChange={(value) =>
                        updatePatternParams('orbit', {
                          direction: value as 'cw' | 'ccw',
                        })
                      }
                      options={[
                        { value: 'cw', label: 'Clockwise' },
                        { value: 'ccw', label: 'Counter-clockwise' },
                      ]}
                    />
                  </>
                ) : selectedPattern === 'grid' ? (
                  <>
                    <SliderField
                      id="grid-spacing"
                      label="Line Spacing"
                      min={5}
                      max={50}
                      step={1}
                      value={gridParams.lineSpacing}
                      valueLabel={`${gridParams.lineSpacing}m`}
                      onChange={(value) =>
                        updatePatternParams('grid', { lineSpacing: value })
                      }
                    />

                    <SliderField
                      id="grid-orientation"
                      label="Orientation"
                      min={-180}
                      max={180}
                      step={1}
                      value={gridParams.orientation}
                      valueLabel={`${gridParams.orientation}°`}
                      onChange={(value) =>
                        updatePatternParams('grid', { orientation: value })
                      }
                    />

                    <SliderField
                      id="grid-cross-angle"
                      label="Cross Angle"
                      min={45}
                      max={135}
                      step={1}
                      value={gridParams.crossAngle}
                      valueLabel={`${gridParams.crossAngle}°`}
                      onChange={(value) =>
                        updatePatternParams('grid', { crossAngle: value })
                      }
                    />
                  </>
                ) : selectedPattern === 'corridor' ? (
                  <>
                    <SliderField
                      id="corridor-passes"
                      label="Passes"
                      min={1}
                      max={5}
                      step={1}
                      value={corridorParams.passes}
                      valueLabel={`${corridorParams.passes}`}
                      onChange={(value) =>
                        updatePatternParams('corridor', { passes: value })
                      }
                    />

                    <SliderField
                      id="corridor-pass-spacing"
                      label="Pass Spacing"
                      min={5}
                      max={30}
                      step={1}
                      value={corridorParams.passSpacing}
                      valueLabel={`${corridorParams.passSpacing}m`}
                      onChange={(value) =>
                        updatePatternParams('corridor', { passSpacing: value })
                      }
                    />

                    <SelectField
                      label="Direction"
                      value={corridorParams.direction}
                      onChange={(value) =>
                        updatePatternParams('corridor', {
                          direction: value as 'auto' | 'reverse',
                        })
                      }
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'reverse', label: 'Reverse' },
                      ]}
                    />
                  </>
                ) : selectedPattern === 'spiral' ? (
                  <>
                    <SliderField
                      id="spiral-arm-spacing"
                      label="Arm Spacing"
                      min={5}
                      max={40}
                      step={1}
                      value={spiralParams.armSpacing}
                      valueLabel={`${spiralParams.armSpacing}m`}
                      onChange={(value) =>
                        updatePatternParams('spiral', { armSpacing: value })
                      }
                    />

                    <SelectField
                      label="Spiral Direction"
                      value={spiralParams.spiralDirection}
                      onChange={(value) =>
                        updatePatternParams('spiral', {
                          spiralDirection: value as 'inward' | 'outward',
                        })
                      }
                      options={[
                        { value: 'inward', label: 'Inward' },
                        { value: 'outward', label: 'Outward' },
                      ]}
                    />

                    <SelectField
                      label="Rotation Direction"
                      value={spiralParams.rotationDirection}
                      onChange={(value) =>
                        updatePatternParams('spiral', {
                          rotationDirection: value as 'cw' | 'ccw',
                        })
                      }
                      options={[
                        { value: 'cw', label: 'Clockwise' },
                        { value: 'ccw', label: 'Counter-clockwise' },
                      ]}
                    />
                  </>
                ) : (
                  <div className="pattern-preview-card">
                    <div className="pattern-preview-header">
                      <ScanSearch size={16} strokeWidth={2.2} />
                      <span>{selectedPatternOption.label} Preview</span>
                    </div>
                    <p>
                      This pattern can already be chosen from the popup and previewed
                      in the viewport. Full generator controls will land in the next
                      mode-expansion pass.
                    </p>
                  </div>
                )}

                <div className="button-row">
                  <button
                    type="button"
                    className="button button-cancel"
                    onClick={handleRedrawMission}
                  >
                    Redraw
                  </button>
                  <button
                    type="button"
                    className="button button-primary button-primary-small"
                    onClick={handleGeneratePath}
                    disabled={
                      !selectedPatternOption.implemented ||
                      generatedWaypoints.length === 0 ||
                      !isPolygonValid
                    }
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
                      <span>{generatedPatternOption.shortLabel}</span>
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
                    {formatPatternGeneratedMeta({
                      patternId: displayPatternId,
                      scanAltitude,
                      lineSpacing,
                      orientation,
                      waypointCount: orderedWaypoints.length,
                      waypointsWithActions,
                      totalWaypointActions,
                      area,
                      meta: displayPatternMeta,
                    })}
                  </p>
                  {orderedWaypoints.length > 0 && (
                    <div className="generated-route-order-note">
                      Start WP {displayStartWaypointId ?? orderedWaypoints[0].id} ·{' '}
                      {isClosedMissionLoop
                        ? 'Closed loop'
                        : `End WP ${missionEndWaypointId ?? '—'}`}
                    </div>
                  )}
                  {orderedWaypoints.length > 0 && (
                    <div className="generated-start-control">
                      <div className="generated-start-copy">
                        <strong>Start Point</strong>
                        <span>{getStartWaypointControlHelp(isClosedMissionLoop)}</span>
                      </div>
                      <select
                        className="generated-start-select"
                        value={startWaypointId === null ? 'auto' : `${startWaypointId}`}
                        onChange={(event) =>
                          handleStartWaypointDropdownChange(event.target.value)
                        }
                      >
                        <option value="auto">
                          Auto (
                          {displayStartWaypointId !== null
                            ? `WP ${displayStartWaypointId}`
                            : '—'}
                          )
                        </option>
                        {startWaypointOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {selectedWaypoint && (
                    <div className="selected-waypoint-summary">
                      Selected WP {selectedWaypoint.id} ·{' '}
                      {selectedWaypoint.role === 'anchor' ? 'Anchor' : 'Intermediate'} · X{' '}
                      {formatWaypointCoordinate(selectedWaypoint.x)} · Y{' '}
                      {formatWaypointCoordinate(selectedWaypoint.y)} · Z{' '}
                      {formatWaypointCoordinate(selectedWaypoint.z)}m ·{' '}
                      {selectedWaypoint.actions.length} actions
                    </div>
                  )}
                </div>

                {generatedBatteryReport && !generatedBatteryReport.isFeasible && (
                  <BatteryWarningBanner
                    report={generatedBatteryReport}
                    onEditMission={editGeneratedPath}
                    onShowDetails={() => setIsBatteryBreakdownExpanded(true)}
                  />
                )}

                {generatedBatteryReport && (
                  <BatterySummaryBar
                    report={generatedBatteryReport}
                    isExpanded={stage === 'generated' && isBatteryBreakdownExpanded}
                    onToggle={() =>
                      setIsBatteryBreakdownExpanded((current) => !current)
                    }
                  />
                )}

                <WaypointDensityPanel
                  config={waypointDensity}
                  metrics={generatedDensityMetrics}
                  countFloor={generatedDensityCountFloor}
                  countCeiling={generatedDensityCountCeiling}
                  protectedCount={generatedProtectedWaypointCount}
                  originalAnchorCount={originalAnchorWaypointCount}
                  isExpanded={isWaypointDensityExpanded}
                  isPending={isGeneratedDensityPending}
                  onToggleExpanded={() =>
                    setIsWaypointDensityExpanded((current) => !current)
                  }
                  onModeChange={handleWaypointDensityModeChange}
                  onCountChange={handleWaypointDensityCountChange}
                  onSpacingChange={handleWaypointDensitySpacingChange}
                  onResetToOriginal={handleResetWaypointDensity}
                />

                <ExclusionZoneSection
                  zones={exclusionZones}
                  activeZoneId={activeExclusionZoneId}
                  activeIssues={activeExclusionIssues}
                  stage={stage}
                  onAddZone={handleAddExclusionZone}
                  onSelectZone={setActiveExclusionZone}
                  onRenameZone={renameExclusionZone}
                  onToggleZone={handleToggleExclusionZone}
                  onDeleteZone={handleDeleteExclusionZone}
                />
              </div>
            )}
          </section>

          <section className="panel-section">
            <header className="section-header">
              <div className="section-title section-title-muted">
                <Plane size={15} strokeWidth={2.1} />
                <span>
                  Vehicle Behavior{stage === 'generated' ? ` (${orderedWaypoints.length})` : ''}
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
              <div ref={behaviorListRef} className="behavior-list">
                <div className="behavior-overview">
                  <div className="behavior-overview-icon">
                    <Route size={16} strokeWidth={2.2} />
                  </div>
                  <div className="behavior-overview-copy">
                    <strong>{generatedPatternOption.shortLabel}</strong>
                    <span>
                      {orderedWaypoints.length} waypoints · {waypointsWithActions} action nodes ·{' '}
                      {totalWaypointActions} actions
                    </span>
                  </div>
                </div>

                {orderedWaypoints.map((waypoint) => (
                  <WaypointBehaviorRow
                    key={waypoint.id}
                    waypoint={waypoint}
                    isSelected={selectedWaypointId === waypoint.id}
                    isHovered={hoveredWaypointId === waypoint.id}
                    isStartNode={displayStartWaypointId === waypoint.id}
                    isEndNode={
                      !isClosedMissionLoop && displayEndWaypointId === waypoint.id
                    }
                    isClosedLoop={isClosedMissionLoop}
                    onHoverChange={setHoveredWaypoint}
                    onRegisterRow={(node) => {
                      if (node) {
                        waypointRowRefs.current.set(waypoint.id, node)
                        return
                      }

                      waypointRowRefs.current.delete(waypoint.id)
                    }}
                    onSelect={selectWaypoint}
                  >
                    {selectedWaypointId === waypoint.id && (
                      <div ref={waypointActionEditorRef}>
                        <WaypointActionEditor
                          key={waypoint.id}
                          waypoint={waypoint}
                          allWaypoints={orderedWaypoints}
                          effectiveStartWaypointId={displayStartWaypointId}
                          missionEndWaypointId={displayEndWaypointId}
                          batteryEstimate={selectedWaypointBatteryEstimate}
                          actionEnergyEstimate={selectedWaypointActionEstimate}
                          actionCostBreakdown={selectedWaypointActionBreakdown}
                          validationMessages={selectedWaypointValidationMessages}
                          pendingActionType={pendingActionType}
                          selectedActionDescription={selectedActionOption.description}
                          onPendingActionTypeChange={setPendingActionType}
                          onAddAction={addWaypointAction}
                          onDuplicateAction={duplicateWaypointAction}
                          onApplyActionToTargets={applyWaypointActionToTargets}
                          onUpdateAction={updateWaypointAction}
                          onRemoveAction={removeWaypointAction}
                          onMoveAction={moveWaypointAction}
                          isInline
                        />
                      </div>
                    )}
                  </WaypointBehaviorRow>
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

function ExclusionZoneSection({
  zones,
  activeZoneId,
  activeIssues,
  stage,
  onAddZone,
  onSelectZone,
  onRenameZone,
  onToggleZone,
  onDeleteZone,
}: {
  zones: ExclusionZone[]
  activeZoneId: number | null
  activeIssues: Array<{
    code: string
    level: 'warning' | 'error'
    message: string
    relatedZoneId?: number
  }>
  stage: 'drawing' | 'editing' | 'generated'
  onAddZone: () => void
  onSelectZone: (zoneId: number | null) => void
  onRenameZone: (zoneId: number, label: string) => void
  onToggleZone: (zoneId: number) => void
  onDeleteZone: (zone: ExclusionZone) => void
}) {
  return (
    <div className="exclusion-section">
      <div className="exclusion-section-header">
        <div className="setup-mode">
          <PencilLine size={16} strokeWidth={2.1} />
          <span>Excluded Areas</span>
        </div>
        <button
          type="button"
          className="link-button"
          onClick={onAddZone}
        >
          <Plus size={14} strokeWidth={2.2} />
          Add
        </button>
      </div>

      {zones.length === 0 ? (
        <div className="exclusion-empty-state">
          Mark areas to skip after the main boundary is ready.
        </div>
      ) : (
        <div className="exclusion-zone-list">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className={`exclusion-zone-row ${
                activeZoneId === zone.id ? 'is-active' : ''
              } ${!zone.enabled ? 'is-disabled' : ''}`}
            >
              <button
                type="button"
                className="exclusion-zone-toggle"
                aria-pressed={zone.enabled}
                onClick={() => onToggleZone(zone.id)}
                disabled={stage === 'drawing'}
              >
                {zone.enabled ? '☑' : '☐'}
              </button>

              <div className="exclusion-zone-main">
                <button
                  type="button"
                  className="exclusion-zone-select"
                  onClick={() => onSelectZone(zone.id)}
                >
                  <span className="exclusion-zone-badge">{zone.id}</span>
                </button>
                <input
                  className="exclusion-zone-input"
                  type="text"
                  value={zone.label}
                  onFocus={() => onSelectZone(zone.id)}
                  onChange={(event) => onRenameZone(zone.id, event.target.value)}
                />
              </div>

              <button
                type="button"
                className="doc-button exclusion-zone-delete"
                aria-label={`Delete ${zone.label}`}
                onClick={() => onDeleteZone(zone)}
                disabled={stage === 'drawing'}
              >
                <Trash2 size={14} strokeWidth={2.1} />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeIssues.length > 0 && (
        <div className="exclusion-issues">
          {activeIssues.map((issue, index) => (
            <div
              key={`${issue.code}-${issue.relatedZoneId ?? 'self'}-${index}`}
              className={`validation-card ${
                issue.level === 'warning' ? 'is-warning' : ''
              }`}
            >
              <span className="validation-card-dot" />
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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

function PatternFieldGrid({ children }: { children: ReactNode }) {
  return <div className="pattern-field-grid">{children}</div>
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="action-field">
      <span className="action-field-label">{label}</span>
      <select
        className="action-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="action-field">
      <span className="action-field-label">{label}</span>
      <div className="action-input-wrap">
        <input
          className="action-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <span className="action-input-suffix">{suffix}</span>}
      </div>
    </label>
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
  isHovered,
  isStartNode,
  isEndNode,
  isClosedLoop,
  onHoverChange,
  onRegisterRow,
  onSelect,
  children,
}: {
  waypoint: MissionWaypoint
  isSelected: boolean
  isHovered: boolean
  isStartNode: boolean
  isEndNode: boolean
  isClosedLoop: boolean
  onHoverChange: (id: number | null) => void
  onRegisterRow: (node: HTMLDivElement | null) => void
  onSelect: (id: number | null) => void
  children?: ReactNode
}) {
  const actionSummary = summarizeWaypointActionStack(waypoint.actions)

  return (
    <div
      ref={onRegisterRow}
      className={`waypoint-row ${isSelected ? 'is-selected' : ''} ${
        isHovered ? 'is-hovered' : ''
      } ${waypoint.role === 'intermediate' ? 'is-intermediate' : ''} ${
        isStartNode ? 'is-start' : ''
      }`}
      onMouseEnter={() => onHoverChange(waypoint.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <button
        type="button"
        className="waypoint-row-trigger"
        onClick={() => onSelect(isSelected ? null : waypoint.id)}
      >
        <div className="waypoint-row-top">
          <div className="waypoint-index">{waypoint.id}</div>
          <div className="waypoint-copy">
            <strong>Navigate to waypoint</strong>
            <div className="waypoint-row-meta">
              <span>{isSelected ? 'Selected in viewport' : 'Waypoint target'}</span>
              <span
                className={`waypoint-role-pill ${
                  waypoint.role === 'anchor' ? 'is-anchor' : 'is-intermediate'
                }`}
              >
                {waypoint.role === 'anchor' ? 'Anchor' : 'Intermediate'}
              </span>
              {isStartNode && (
                <span className="waypoint-status-pill is-start">
                  {isClosedLoop ? 'Start / Return' : 'Start Node'}
                </span>
              )}
              {isEndNode && (
                <span className="waypoint-status-pill is-end">End Node</span>
              )}
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

      {isSelected && children}
    </div>
  )
}

function WaypointActionEditor({
  waypoint,
  allWaypoints,
  effectiveStartWaypointId,
  missionEndWaypointId,
  batteryEstimate,
  actionEnergyEstimate,
  actionCostBreakdown,
  validationMessages,
  pendingActionType,
  selectedActionDescription,
  onPendingActionTypeChange,
  onAddAction,
  onDuplicateAction,
  onApplyActionToTargets,
  onUpdateAction,
  onRemoveAction,
  onMoveAction,
  isInline = false,
}: {
  waypoint: MissionWaypoint
  allWaypoints: MissionWaypoint[]
  effectiveStartWaypointId: number | null
  missionEndWaypointId: number | null
  batteryEstimate: WaypointBatteryEstimate | null
  actionEnergyEstimate: {
    costMah: number
    timeSec: number
  } | null
  actionCostBreakdown: Array<{
    actionId: number
    label: string
    costMah: number
  }>
  validationMessages: string[]
  pendingActionType: MissionWaypointActionType
  selectedActionDescription: string
  onPendingActionTypeChange: (type: MissionWaypointActionType) => void
  onAddAction: (waypointId: number, type: MissionWaypointActionType) => void
  onDuplicateAction: (waypointId: number, actionId: number) => void
  onApplyActionToTargets: (
    sourceWaypointId: number,
    actionId: number,
    targetWaypointIds: number[],
  ) => void
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
  isInline?: boolean
}) {
  const [expandedActionIds, setExpandedActionIds] = useState<Record<number, boolean>>(
    () => getInitialExpandedActionIds(waypoint.actions),
  )
  const previousActionIdsRef = useRef<number[]>(waypoint.actions.map((action) => action.id))

  useEffect(() => {
    const nextActionIds = waypoint.actions.map((action) => action.id)
    const previousActionIds = previousActionIdsRef.current
    const addedActionIds = nextActionIds.filter(
      (actionId) => !previousActionIds.includes(actionId),
    )

    if (addedActionIds.length === 0 && nextActionIds.length === previousActionIds.length) {
      previousActionIdsRef.current = nextActionIds
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      setExpandedActionIds((current) => {
        const nextState = Object.fromEntries(
          Object.entries(current).filter(([actionId]) =>
            nextActionIds.includes(Number(actionId)),
          ),
        ) as Record<number, boolean>

        addedActionIds.forEach((actionId) => {
          nextState[actionId] = true
        })

        return nextState
      })
    })

    previousActionIdsRef.current = nextActionIds

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [waypoint.actions])

  function toggleActionExpanded(actionId: number) {
    setExpandedActionIds((current) => ({
      ...current,
      [actionId]: !current[actionId],
    }))
  }

  return (
    <div className={`action-editor-card ${isInline ? 'is-inline' : ''}`}>
      <div className="action-editor-header">
        <div className="action-editor-copy">
          <strong>{isInline ? `Waypoint ${waypoint.id} Actions` : `Waypoint ${waypoint.id} Actions`}</strong>
          <span>
            {isInline
              ? 'Configure this waypoint without leaving its card.'
              : 'Assign mission behaviors to this node.'}
          </span>
        </div>
        <div className="action-editor-count">
          {waypoint.role === 'anchor' ? 'Anchor' : 'Intermediate'} ·{' '}
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

      {validationMessages.length > 1 && (
        <div className="action-status-list">
          {validationMessages.slice(1).map((message) => (
            <span key={message}>{message}</span>
          ))}
        </div>
      )}

      {(batteryEstimate || actionEnergyEstimate) && (
        <div className="action-energy-card">
          <div className="action-energy-header">
            <strong>Battery impact</strong>
            {actionEnergyEstimate && (
              <span>
                -{Math.round(actionEnergyEstimate.costMah)} mAh ·{' '}
                {formatDurationShort(actionEnergyEstimate.timeSec)}
              </span>
            )}
          </div>

          {actionCostBreakdown.length > 0 ? (
            <div className="action-energy-list">
              {actionCostBreakdown.map((entry) => (
                <div key={entry.actionId} className="action-energy-row">
                  <span>{entry.label}</span>
                  <strong>-{Math.round(entry.costMah)} mAh</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="action-energy-empty">
              Add actions to see per-node energy impact.
            </div>
          )}

          {batteryEstimate && (
            <div className="action-energy-footnote">
              Remaining after WP {waypoint.id}: ~{Math.round(batteryEstimate.remainingPercent)}%
              {' '}· RTH cost from here: {Math.round(batteryEstimate.rthCostFromHereMah)} mAh
            </div>
          )}
        </div>
      )}

      {waypoint.actions.length > 0 ? (
        <div className="action-list">
          {waypoint.actions.map((action, index) => (
            <WaypointActionCard
              key={`${waypoint.id}-${action.id}`}
              waypoint={waypoint}
              action={action}
              index={index}
              total={waypoint.actions.length}
              allWaypoints={allWaypoints}
              effectiveStartWaypointId={effectiveStartWaypointId}
              missionEndWaypointId={missionEndWaypointId}
              isExpanded={expandedActionIds[action.id] ?? false}
              onToggleExpanded={toggleActionExpanded}
              onDuplicateAction={onDuplicateAction}
              onApplyActionToTargets={onApplyActionToTargets}
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
  waypoint,
  action,
  index,
  total,
  allWaypoints,
  effectiveStartWaypointId,
  missionEndWaypointId,
  isExpanded,
  onToggleExpanded,
  onDuplicateAction,
  onApplyActionToTargets,
  onUpdateAction,
  onRemoveAction,
  onMoveAction,
}: {
  waypoint: MissionWaypoint
  action: MissionWaypointAction
  index: number
  total: number
  allWaypoints: MissionWaypoint[]
  effectiveStartWaypointId: number | null
  missionEndWaypointId: number | null
  isExpanded: boolean
  onToggleExpanded: (actionId: number) => void
  onDuplicateAction: (waypointId: number, actionId: number) => void
  onApplyActionToTargets: (
    sourceWaypointId: number,
    actionId: number,
    targetWaypointIds: number[],
  ) => void
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
  const [isApplyPanelOpen, setIsApplyPanelOpen] = useState(false)
  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>([])
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const actionWarnings = useMemo(
    () =>
      getWaypointActionCardWarnings({
        waypoint,
        action,
        effectiveStartWaypointId,
        missionEndWaypointId,
      }),
    [action, effectiveStartWaypointId, missionEndWaypointId, waypoint],
  )
  const availableTargetWaypoints = useMemo(
    () =>
      allWaypoints.filter((candidate) => candidate.id !== waypoint.id),
    [allWaypoints, waypoint.id],
  )

  function toggleTargetWaypoint(waypointId: number) {
    setSelectedTargetIds((current) =>
      current.includes(waypointId)
        ? current.filter((id) => id !== waypointId)
        : [...current, waypointId],
    )
  }

  function selectTargetRange() {
    const startId = Number(rangeStart)
    const endId = Number(rangeEnd)

    if (Number.isNaN(startId) || Number.isNaN(endId)) {
      return
    }

    const minId = Math.min(startId, endId)
    const maxId = Math.max(startId, endId)

    setSelectedTargetIds(
      availableTargetWaypoints
        .filter((candidate) => candidate.id >= minId && candidate.id <= maxId)
        .map((candidate) => candidate.id),
    )
  }

  function applyToSelectedTargets() {
    if (selectedTargetIds.length === 0) {
      return
    }

    onApplyActionToTargets(waypoint.id, action.id, selectedTargetIds)
    setIsApplyPanelOpen(false)
  }

  return (
    <div
      className={`waypoint-action-card ${isExpanded ? 'is-expanded' : ''} ${
        actionWarnings.length > 0 ? 'has-warning' : ''
      }`}
    >
      <div className="waypoint-action-top">
        <button
          type="button"
          className="waypoint-action-summary-button"
          onClick={() => onToggleExpanded(action.id)}
        >
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
          <div className="waypoint-action-summary-meta">
            {actionWarnings.length > 0 && (
              <span className="waypoint-action-warning-pill">
                {actionWarnings.length} warning
                {actionWarnings.length > 1 ? 's' : ''}
              </span>
            )}
            {isExpanded ? (
              <ChevronDown size={15} strokeWidth={2.2} />
            ) : (
              <ChevronRight size={15} strokeWidth={2.2} />
            )}
          </div>
        </button>

        <div className="waypoint-action-controls">
          <button
            type="button"
            className="icon-button"
            onClick={() => onMoveAction(waypoint.id, action.id, 'up')}
            disabled={index === 0}
            aria-label="Move action up"
          >
            <ArrowUp size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onMoveAction(waypoint.id, action.id, 'down')}
            disabled={index === total - 1}
            aria-label="Move action down"
          >
            <ArrowDown size={14} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="icon-button is-danger"
            onClick={() => onRemoveAction(waypoint.id, action.id)}
            aria-label="Remove action"
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="waypoint-action-utility-row">
            <button
              type="button"
              className="action-utility-button"
              onClick={() => onDuplicateAction(waypoint.id, action.id)}
            >
              Duplicate
            </button>
            <button
              type="button"
              className={`action-utility-button ${
                isApplyPanelOpen ? 'is-active' : ''
              }`}
              onClick={() => setIsApplyPanelOpen((current) => !current)}
            >
              Apply to...
            </button>
          </div>

          {actionWarnings.length > 0 && (
            <div className="waypoint-action-warning-list">
              {actionWarnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          )}

          {isApplyPanelOpen && (
            <div className="apply-action-panel">
              <div className="apply-action-panel-header">
                <strong>Apply to other waypoints</strong>
                <span>Copy this action and its current config to more nodes.</span>
              </div>

              {availableTargetWaypoints.length > 0 ? (
                <div className="apply-action-targets">
                  {availableTargetWaypoints.map((targetWaypoint) => (
                    <label
                      key={targetWaypoint.id}
                      className="apply-action-checkbox"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTargetIds.includes(targetWaypoint.id)}
                        onChange={() => toggleTargetWaypoint(targetWaypoint.id)}
                      />
                      <span>Waypoint {targetWaypoint.id}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="empty-action-state is-inline">
                  No other waypoints available for apply-to.
                </div>
              )}

              <div className="apply-action-range">
                <input
                  className="action-input"
                  type="number"
                  min={1}
                  placeholder="From"
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                />
                <input
                  className="action-input"
                  type="number"
                  min={1}
                  placeholder="To"
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                />
                <button
                  type="button"
                  className="action-utility-button"
                  onClick={selectTargetRange}
                >
                  Select range
                </button>
                <button
                  type="button"
                  className="action-utility-button"
                  onClick={() =>
                    setSelectedTargetIds(
                      availableTargetWaypoints.map((targetWaypoint) => targetWaypoint.id),
                    )
                  }
                >
                  All others
                </button>
              </div>

              <div className="apply-action-footer">
                <button
                  type="button"
                  className="button button-cancel"
                  onClick={() => setIsApplyPanelOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary-small"
                  onClick={applyToSelectedTargets}
                  disabled={selectedTargetIds.length === 0}
                >
                  Apply to {selectedTargetIds.length || 0}
                </button>
              </div>
            </div>
          )}

          <div className="waypoint-action-fields">
            {action.type === 'hover' && (
              <ActionNumberField
                label="Duration"
                value={action.config.durationSec}
                suffix="sec"
                min={1}
                step={1}
                onChange={(value) =>
                  onUpdateAction(waypoint.id, action.id, { durationSec: value })
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
                  onUpdateAction(waypoint.id, action.id, { burstCount: value })
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
                  onUpdateAction(waypoint.id, action.id, { durationSec: value })
                }
              />
            )}

            {action.type === 'drop_payload' && (
              <ActionTextField
                label="Payload Type"
                value={action.config.payloadType}
                onChange={(value) =>
                  onUpdateAction(waypoint.id, action.id, { payloadType: value })
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
                  onUpdateAction(waypoint.id, action.id, { durationSec: value })
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
                  onUpdateAction(waypoint.id, action.id, { altitudeDelta: value })
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
                  onUpdateAction(waypoint.id, action.id, { pitch: value })
                }
              />
            )}

            {action.type === 'trigger_sensor' && (
              <ActionTextField
                label="Sensor Name"
                value={action.config.sensorName}
                onChange={(value) =>
                  onUpdateAction(waypoint.id, action.id, { sensorName: value })
                }
              />
            )}
          </div>
        </>
      )}
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

function formatDurationShort(valueSec: number): string {
  const roundedSec = Math.max(0, Math.round(valueSec))
  const minutes = Math.floor(roundedSec / 60)
  const seconds = roundedSec % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function estimateTheoreticalFlightMinutes(droneProfile: DroneProfile): number {
  const currentMah =
    (droneProfile.batteryCapacityMah /
      ((droneProfile.powerCruise / droneProfile.batteryVoltageNominal) * 1000)) *
    60

  return Math.max(1, Math.round(currentMah))
}

function getWaypointActionCostBreakdown(
  waypoint: MissionWaypoint,
  droneProfile: DroneProfile,
): Array<{
  actionId: number
  label: string
  costMah: number
}> {
  let currentAltitude = waypoint.z

  return waypoint.actions.map((action) => {
    const estimate = computeWaypointActionEnergy({
      actions: [action],
      startAltitude: currentAltitude,
      droneProfile,
    })

    currentAltitude = estimate.endAltitude

    return {
      actionId: action.id,
      label: getWaypointActionLabel(action.type),
      costMah: estimate.costMah,
    }
  })
}

function getInitialExpandedActionIds(
  actions: MissionWaypointAction[],
): Record<number, boolean> {
  if (actions.length === 0) {
    return {}
  }

  return {
    [actions[0].id]: true,
  }
}

function getWaypointActionCardWarnings({
  waypoint,
  action,
  effectiveStartWaypointId,
  missionEndWaypointId,
}: {
  waypoint: MissionWaypoint
  action: MissionWaypointAction
  effectiveStartWaypointId: number | null
  missionEndWaypointId: number | null
}): string[] {
  const warnings = [...validateWaypointAction(action)]
  const totalTimedDuration = waypoint.actions.reduce((total, candidate) => {
    if (
      candidate.type === 'hover' ||
      candidate.type === 'record_video' ||
      candidate.type === 'fire_suppress'
    ) {
      return total + candidate.config.durationSec
    }

    return total
  }, 0)

  if (
    (action.type === 'hover' ||
      action.type === 'record_video' ||
      action.type === 'fire_suppress') &&
    totalTimedDuration > 60
  ) {
    warnings.push('Long dwell time at this waypoint - verify battery budget.')
  }

  const isDuplicateAction = waypoint.actions.some(
    (candidate) =>
      candidate.id !== action.id &&
      candidate.type === action.type &&
      JSON.stringify(candidate.config) === JSON.stringify(action.config),
  )

  if (isDuplicateAction) {
    warnings.push('Duplicate action - consider merging.')
  }

  if (action.type === 'change_altitude') {
    const nextAltitude = waypoint.z + action.config.altitudeDelta

    if (nextAltitude < 0 || nextAltitude > 200) {
      warnings.push('Altitude out of safe range.')
    }

    if (effectiveStartWaypointId === waypoint.id) {
      if (nextAltitude < 5) {
        warnings.push('Dangerously low altitude at mission start.')
      } else {
        warnings.push(
          'Altitude change at start - drone will adjust immediately after reaching start position.',
        )
      }
    }
  }

  if (
    action.type === 'drop_payload' &&
    missionEndWaypointId !== null &&
    waypoint.id !== missionEndWaypointId
  ) {
    warnings.push('Payload drop mid-flight - confirm intentional.')
  }

  return warnings.filter(
    (warning, index) =>
      warnings.findIndex((candidate) => candidate === warning) === index,
  )
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

function getPatternGlyph(patternId: FlightPatternId): string {
  switch (patternId) {
    case 'coverage':
      return 'CV'
    case 'perimeter':
      return 'PM'
    case 'orbit':
      return 'OI'
    case 'spiral':
      return 'SP'
    case 'grid':
      return 'GD'
    case 'corridor':
      return 'CR'
  }
}

function formatPatternGeneratedMeta({
  patternId,
  scanAltitude,
  lineSpacing,
  orientation,
  waypointCount,
  waypointsWithActions,
  totalWaypointActions,
  area,
  meta,
}: {
  patternId: FlightPatternId
  scanAltitude: number
  lineSpacing: number
  orientation: number
  waypointCount: number
  waypointsWithActions: number
  totalWaypointActions: number
  area: number
  meta: FlightPatternMissionMeta | null
}): string {
  const sharedTail = `${waypointCount} pts · ${waypointsWithActions} action nodes · ${totalWaypointActions} actions · ~${Math.round(area)} m²`

  switch (patternId) {
    case 'coverage':
      return `Alt: ${scanAltitude}m · Spacing: ${lineSpacing}m · ${orientation}° · ${sharedTail}`
    case 'perimeter':
      return `Alt: ${scanAltitude}m · Boundary track · ${meta?.loops ?? 1} loop · ${meta?.direction ?? 'CW'} · ${sharedTail}`
    case 'orbit':
      return `Alt: ${scanAltitude}m · Auto center · Auto-fit radius · ${meta?.loops ?? 1} loop · ${meta?.direction ?? 'CW'} · ${sharedTail}`
    case 'spiral':
      return `Alt: ${scanAltitude}m · Inward spiral · ${meta?.direction ?? 'INWARD CW'} · ${sharedTail}`
    case 'grid':
      return `Alt: ${scanAltitude}m · Spacing: ${lineSpacing}m · ${orientation}° + 90° · ${meta?.direction ?? 'cross-hatch'} · ${sharedTail}`
    case 'corridor':
      return `Alt: ${scanAltitude}m · Center corridor · ${meta?.direction ?? 'AUTO'} · ${sharedTail}`
  }
}

function getDefaultPatternPickerPosition(
  containerSize: { width: number; height: number },
): { left: number; top: number; width: number; placement: 'above' | 'below' } | null {
  if (containerSize.width === 0 || containerSize.height === 0) {
    return null
  }

  const { width, height } = containerSize
  const margin = 16
  const popupWidth = Math.min(320, Math.max(width - margin * 2, 0))
  const popupHeight = Math.min(420, Math.max(height - margin * 2, 0))

  if (popupWidth <= 0 || popupHeight <= 0) {
    return null
  }

  const preferredTop = margin
  const preferredLeft = margin

  return {
    left: clampValue(preferredLeft, margin, width - popupWidth - margin),
    top: clampValue(preferredTop, margin, height - popupHeight - margin),
    width: popupWidth,
    placement: 'below',
  }
}

function clampOverlayPanelPosition(
  position: OverlayAnchor,
  panelSize: OverlayPanelSize,
  containerSize: { width: number; height: number },
): { left: number; top: number } {
  const margin = 16
  const safeWidth = Math.max(panelSize.width, 0)
  const safeHeight = Math.max(panelSize.height, 0)
  const maxLeft = Math.max(margin, containerSize.width - safeWidth - margin)
  const maxTop = Math.max(margin, containerSize.height - safeHeight - margin)

  return {
    left: clampValue(position.x, margin, maxLeft),
    top: clampValue(position.y, margin, maxTop),
  }
}

function getWaypointRadialMenuPosition(
  anchor: OverlayAnchor | null,
  containerSize: { width: number; height: number },
): { left: number; top: number } | null {
  if (!anchor || containerSize.width === 0 || containerSize.height === 0) {
    return null
  }

  const menuSize = 228
  const radius = menuSize / 2
  const margin = 18

  return {
    left: clampValue(anchor.x, radius + margin, containerSize.width - radius - margin),
    top: clampValue(
      anchor.y,
      radius + margin,
      containerSize.height - radius - margin,
    ),
  }
}

function getWaypointRadialItems(): Array<{
  type: MissionWaypointActionType
  shortLabel: string
  description: string
  x: number
  y: number
}> {
  const positionByType: Record<
    MissionWaypointActionType,
    { x: number; y: number; shortLabel: string }
  > = {
    take_photo: { x: 50, y: 10, shortLabel: 'Photo' },
    record_video: { x: 77, y: 23, shortLabel: 'Video' },
    drop_payload: { x: 90, y: 50, shortLabel: 'Drop' },
    fire_suppress: { x: 77, y: 77, shortLabel: 'Foam' },
    change_altitude: { x: 50, y: 90, shortLabel: 'Alt' },
    trigger_sensor: { x: 23, y: 77, shortLabel: 'Sensor' },
    set_gimbal: { x: 10, y: 50, shortLabel: 'Gimbal' },
    hover: { x: 23, y: 23, shortLabel: 'Hold' },
  }

  return WAYPOINT_ACTION_OPTIONS.map((option) => ({
    type: option.type,
    shortLabel: positionByType[option.type].shortLabel,
    description: option.description,
    x: positionByType[option.type].x,
    y: positionByType[option.type].y,
  }))
}

function getStartWaypointOptions({
  allowedStartWaypointIds,
  waypoints,
  isClosedLoop,
}: {
  allowedStartWaypointIds: number[]
  waypoints: MissionWaypoint[]
  isClosedLoop: boolean
}): Array<{ value: string; label: string }> {
  if (allowedStartWaypointIds.length === 0) {
    return []
  }

  const rawStartWaypointId = waypoints[0]?.id ?? null
  const rawEndWaypointId = waypoints[waypoints.length - 1]?.id ?? null

  return allowedStartWaypointIds.map((waypointId) => {
    if (isClosedLoop) {
      return {
        value: `${waypointId}`,
        label: `WP ${waypointId} · Rotate loop`,
      }
    }

    if (waypointId === rawStartWaypointId) {
      return {
        value: `${waypointId}`,
        label: `WP ${waypointId} · Forward path`,
      }
    }

    if (waypointId === rawEndWaypointId) {
      return {
        value: `${waypointId}`,
        label: `WP ${waypointId} · Reverse path`,
      }
    }

    return {
      value: `${waypointId}`,
      label: `WP ${waypointId}`,
    }
  })
}

function getStartWaypointControlHelp(isClosedLoop: boolean): string {
  return isClosedLoop
    ? 'Closed loops can rotate to start from any waypoint.'
    : 'Open paths can only start from either endpoint.'
}

function getBlockedStartWaypointMessage(isClosedLoop: boolean): string {
  return isClosedLoop
    ? 'This loop can rotate from any waypoint after generation.'
    : 'Only the first or last waypoint can become the mission start for this path.'
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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

function serializeWaypointDensityConfig(config: {
  mode: string
  targetCount: number | null
  targetSpacing: number | null
  simplifyTolerance?: number | null
  protectActioned?: boolean
}): string {
  return JSON.stringify({
    mode: config.mode,
    targetCount: config.targetCount,
    targetSpacing: config.targetSpacing,
    simplifyTolerance: config.simplifyTolerance ?? null,
    protectActioned: config.protectActioned ?? true,
  })
}

export default App
