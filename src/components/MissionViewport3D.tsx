import {
  Billboard,
  Grid,
  Html,
  Line,
  OrbitControls,
  PerspectiveCamera,
  Text,
} from '@react-three/drei'
import {
  Aperture,
  Camera,
  Flame,
  MoveVertical,
  Package,
  ScanSearch,
  TimerReset,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { DroneGhost } from './DroneGhost'
import {
  getFlightPatternOption,
  type FlightPatternId,
} from '../lib/flightPatterns'
import {
  WORLD_BOUNDS,
  WORLD_DIMENSIONS,
  clampWorldPoint,
  polygonCentroid,
  type Vec2,
} from '../lib/missionGeometry'
import { getStartWaypointPolicy } from '../lib/waypointInteraction'
import type {
  MissionBatteryReport,
  SafetyLevel,
  WaypointBatteryEstimate,
} from '../lib/batteryModels'
import {
  DRONE_SIMULATION_FOLLOW_RESUME_DELAY_MS,
  DRONE_SIMULATION_LONG_PATH_WAYPOINT_THRESHOLD,
  DRONE_SIMULATION_RESTART_DELAY_MS,
  DRONE_SIMULATION_CAMERA_DESIRED_POLAR_ANGLE,
  DRONE_SIMULATION_CAMERA_DESIRED_FOV,
  DRONE_SIMULATION_CAMERA_MAX_DISTANCE,
  DRONE_SIMULATION_CAMERA_MAX_POLAR_ANGLE,
  DRONE_SIMULATION_CAMERA_MIN_DISTANCE,
  DRONE_SIMULATION_CAMERA_MIN_POLAR_ANGLE,
  DRONE_SIMULATION_CAMERA_POSITION_LERP_SPEED,
  DRONE_SIMULATION_CAMERA_RECOVERY_LERP_SPEED,
  DRONE_SIMULATION_CAMERA_TARGET_LERP_SPEED,
  DRONE_SIMULATION_PREVIEW_CAMERA_FOV,
  DRONE_SIMULATION_PREVIEW_CAMERA_ORBIT_AZIMUTH_AMPLITUDE_DEG,
  DRONE_SIMULATION_PREVIEW_CAMERA_ORBIT_CYCLE_MS,
  DRONE_SIMULATION_PREVIEW_CAMERA_ORBIT_POLAR_AMPLITUDE_DEG,
  DRONE_SIMULATION_PREVIEW_CAMERA_ORBIT_Z_DRIFT,
  DRONE_SIMULATION_PREVIEW_CAMERA_POSITION,
  DRONE_SIMULATION_PREVIEW_CAMERA_TARGET,
  DRONE_SIMULATION_TRAIL_POINT_LIMIT,
  DRONE_SIMULATION_TRAIL_POINT_LIMIT_LONG_PATH,
} from '../lib/droneSimulationConstants'
import { getWaypointSimulationActionCues } from '../lib/droneSimulationActions'
import {
  buildDroneSimulationPath,
  getDroneSimulationPathSplit,
  getDroneSimulationWaypointIndexAtProgress,
  getDroneSimulationWaypointProgress,
  sampleDroneSimulationPath,
} from '../lib/droneSimulationPath'
import {
  DEFAULT_DRONE_SIMULATION_TELEMETRY,
  getDroneSimulationDurationMs,
  type DroneSimulationCommand,
  type DroneSimulationSession,
  type DroneSimulationTelemetry,
} from '../lib/droneSimulationPlayback'
import type {
  DrawingTarget,
  ExclusionZone,
  MissionPoint,
  MissionStage,
  MissionWaypoint,
} from '../store/useMissionStore'
import type { MissionWaypointActionType } from '../lib/waypointActions'
import {
  calculateWaypointStemHitboxHeight,
  calculateWaypointStemHitboxRadius,
  calculateWaypointZMetersPerPixel,
  getWaypointDragClampState,
  WAYPOINT_DRAG_MAX_ALTITUDE,
  WAYPOINT_DRAG_MIN_ALTITUDE,
  type WaypointPositionPatch,
} from '../lib/waypointDrag'

const CAMERA_POSITION: [number, number, number] = [156, 132, 156]
const WORLD_CENTER = { x: 0, y: 0 }
const GROUND_SURFACE_HEIGHT = 0.22
const ALTITUDE_PLANE_FILL_OFFSET = 0.06
const ALTITUDE_PLANE_GRID_OFFSET = 0.12
const ALTITUDE_LINE_OFFSET = 0.18
const ALTITUDE_MARKER_LIFT = 2.6
const HOVER_OFFSET = 0.28
const DRONE_LIFT = 6
const MAX_CLICK_DELTA = 4
const MIN_CAMERA_DISTANCE = 120
const MAX_CAMERA_DISTANCE = 520
const FIT_PADDING = 1.3
const CLOSE_SNAP_RADIUS_PX = 16
const DEFAULT_MIN_POLAR_ANGLE = Math.PI / 4.8
const DEFAULT_MAX_POLAR_ANGLE = Math.PI / 2.04
const DRAWING_MAX_POLAR_ANGLE = Math.PI / 2.5
const DRAWING_TARGET_LERP_SPEED = 7.5
const DRAWING_DISTANCE_DAMP_SPEED = 5.5
const DRAWING_FIT_PADDING = 1.14
const GENERATED_REVEAL_DURATION = 0.92
const GENERATED_RECENTER_DURATION = 0.36
const GENERATED_SELECTION_BLEND = 0.42
const PREVIEW_FADE_OUT_DURATION = 0.14
const PREVIEW_GAP_DURATION = 0.08
const PREVIEW_REVEAL_DURATION = 0.34
const GENERATED_ROUTE_REVEAL_DURATION = 0.76
const PATTERN_OVERLAY_OFFSET = 0.22
const PATTERN_FILL_OFFSET = 0.04
type ScenePoint = [number, number, number]
export type ViewportAnimationState = 'animating' | 'skipped' | 'settled'
export interface CameraDebugSnapshot {
  position: {
    x: number
    y: number
    z: number
  }
  target: {
    x: number
    y: number
    z: number
  }
  distance: number
  polarDeg: number
  azimuthDeg: number
  fov: number
}
export interface WaypointContextMenuRequest {
  waypointId: number
  clientX: number
  clientY: number
}
type OrbitControlsHandle = {
  target: THREE.Vector3
  update: () => void
  enabled: boolean
  enablePan: boolean
  enableRotate: boolean
  enableZoom: boolean
  minDistance: number
  maxDistance: number
  minPolarAngle: number
  maxPolarAngle: number
}

interface SimulationCameraProfile {
  desiredDistance: number
  minDistance: number
  maxDistance: number
  desiredPolarAngle: number
  minPolarAngle: number
  maxPolarAngle: number
  desiredFov: number
  lookAheadDistance: number
  missionCenterBlend: number
  heightBias: number
  targetLerpSpeed: number
  positionLerpSpeed: number
  recoveryLerpSpeed: number
  fixedPosition?: THREE.Vector3
  fixedTarget?: THREE.Vector3
  previewOrbit?: {
    azimuthAmplitudeDeg: number
    polarAmplitudeDeg: number
    cycleDurationMs: number
    zDrift: number
  }
}

interface WaypointXYDragState {
  waypointId: number
  start: MissionWaypoint
  altitude: number
  clientX: number
  clientY: number
}

interface WaypointZDragState {
  waypointId: number
  start: MissionWaypoint
  startClientY: number
  clientX: number
  clientY: number
  metersPerPixel: number
  clampState: 'none' | 'min' | 'max'
  snapActive: boolean
}

interface MissionViewport3DProps {
  stage: MissionStage
  scanAltitude: number
  points: MissionPoint[]
  exclusionZones: ExclusionZone[]
  activeExclusionZoneId: number | null
  drawingTarget: DrawingTarget
  drawingPoints: MissionPoint[]
  patternSegments: Array<[Vec2, Vec2]>
  waypoints: MissionWaypoint[]
  pendingDensityPreviewWaypoints?: MissionWaypoint[] | null
  pendingDensityPreviewAnchorWaypoints?: MissionWaypoint[] | null
  batteryReport?: MissionBatteryReport | null
  selectedWaypointId: number | null
  isClosedLoopMission?: boolean
  hoveredWaypointId?: number | null
  selectedPattern: FlightPatternId
  hoveredPattern: FlightPatternId | null
  patternPickerVisible: boolean
  waypointContextMenuVisible?: boolean
  bulkAssignActionType?: MissionWaypointActionType | null
  simulationSession?: DroneSimulationSession | null
  simulationCommand?: DroneSimulationCommand | null
  simulationSpeed?: number
  simulationFollowCamera?: boolean
  skipAnimationToken: number
  onStartDrawing: () => void
  onAddPoint: (x: number, y: number) => void
  onUpdatePoint: (id: number, x: number, y: number) => void
  onClosePolygon: () => void
  onSelectWaypoint: (id: number | null) => void
  onUpdateWaypointPosition?: (id: number, patch: WaypointPositionPatch) => void
  onBulkAssignWaypoint?: (id: number) => void
  onExitBulkAssign?: () => void
  onHoveredWaypointChange?: (id: number | null) => void
  onWaypointContextMenu?: (request: WaypointContextMenuRequest) => void
  onSelectExclusionZone?: (id: number | null) => void
  onReadyToCloseChange?: (ready: boolean) => void
  onPatternPickerAnchorChange?: (anchor: Vec2 | null) => void
  onAnimationStateChange?: (state: ViewportAnimationState) => void
  onSimulationTelemetryChange?: (telemetry: DroneSimulationTelemetry) => void
  onCameraDebugChange?: (snapshot: CameraDebugSnapshot | null) => void
}

export function MissionViewport3D({
  stage,
  scanAltitude,
  points,
  exclusionZones,
  activeExclusionZoneId,
  drawingTarget,
  drawingPoints,
  patternSegments,
  waypoints,
  pendingDensityPreviewWaypoints = null,
  pendingDensityPreviewAnchorWaypoints = null,
  batteryReport = null,
  selectedWaypointId,
  isClosedLoopMission,
  hoveredWaypointId = null,
  selectedPattern,
  hoveredPattern,
  patternPickerVisible,
  waypointContextMenuVisible = false,
  bulkAssignActionType = null,
  simulationSession = null,
  simulationCommand = null,
  simulationSpeed = 1,
  simulationFollowCamera = true,
  skipAnimationToken,
  onStartDrawing,
  onAddPoint,
  onUpdatePoint,
  onClosePolygon,
  onSelectWaypoint,
  onUpdateWaypointPosition,
  onBulkAssignWaypoint,
  onExitBulkAssign,
  onHoveredWaypointChange,
  onWaypointContextMenu,
  onSelectExclusionZone,
  onReadyToCloseChange,
  onPatternPickerAnchorChange,
  onAnimationStateChange,
  onSimulationTelemetryChange,
  onCameraDebugChange,
}: MissionViewport3DProps) {
  const [draggingPointId, setDraggingPointId] = useState<number | null>(null)
  const [isWaypointDragActive, setIsWaypointDragActive] = useState(false)
  const [isGeneratedRevealActive, setIsGeneratedRevealActive] = useState(false)
  const [isPatternTransitionActive, setIsPatternTransitionActive] = useState(false)
  const [isRouteRevealActive, setIsRouteRevealActive] = useState(false)
  const [viewportCursor, setViewportCursor] = useState('')
  const previousSkipTokenRef = useRef(skipAnimationToken)
  const animationStateRef = useRef<ViewportAnimationState>('settled')
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const orbitControlsRef = useRef<OrbitControlsHandle | null>(null)
  const lastOrbitInteractionAtRef = useRef(0)
  const isAnimationLocked =
    isGeneratedRevealActive || isPatternTransitionActive || isRouteRevealActive
  const publishAnimationState = useCallback(
    (nextState: ViewportAnimationState) => {
      if (animationStateRef.current === nextState) {
        return
      }

      animationStateRef.current = nextState
      onAnimationStateChange?.(nextState)
    },
    [onAnimationStateChange],
  )

  const cameraTarget = useMemo(() => {
    if (drawingTarget === 'exclusion' && drawingPoints.length > 0) {
      return polygonCentroid(drawingPoints)
    }

    if (points.length > 0) {
      return polygonCentroid(points)
    }

    if (waypoints.length > 0) {
      return polygonCentroid(waypoints)
    }

    return WORLD_CENTER
  }, [drawingPoints, drawingTarget, points, waypoints])

  useEffect(() => {
    if (skipAnimationToken === previousSkipTokenRef.current) {
      return
    }

    previousSkipTokenRef.current = skipAnimationToken

    if (isAnimationLocked) {
      publishAnimationState('skipped')
    }
  }, [isAnimationLocked, publishAnimationState, skipAnimationToken])

  useEffect(() => {
    if (isAnimationLocked) {
      if (animationStateRef.current !== 'skipped') {
        publishAnimationState('animating')
      }
      return
    }

    publishAnimationState('settled')
  }, [isAnimationLocked, publishAnimationState])

  const handleCanvasPointerMissed = useCallback(
    (event: MouseEvent) => {
      if (stage !== 'generated' || selectedWaypointId === null) {
        return
      }

      if (isAnimationLocked || isWaypointDragActive) {
        return
      }

      if (waypointContextMenuVisible || bulkAssignActionType) {
        return
      }

      if (event.button !== 0) {
        return
      }

      onHoveredWaypointChange?.(null)
      onSelectWaypoint(null)
    },
    [
      bulkAssignActionType,
      isAnimationLocked,
      isWaypointDragActive,
      onHoveredWaypointChange,
      onSelectWaypoint,
      selectedWaypointId,
      stage,
      waypointContextMenuVisible,
    ],
  )

  return (
    <Canvas
      className="viewport-canvas"
      gl={{ antialias: true }}
      onPointerMissed={handleCanvasPointerMissed}
      style={{ cursor: viewportCursor || undefined }}
    >
      <color attach="background" args={['#d6e0ec']} />
      <fog attach="fog" args={['#d6e0ec', 210, 420]} />
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={CAMERA_POSITION}
        fov={34}
      />

      <Suspense fallback={null}>
        <MissionWorld
          stage={stage}
          scanAltitude={scanAltitude}
          points={points}
          exclusionZones={exclusionZones}
          activeExclusionZoneId={activeExclusionZoneId}
          drawingTarget={drawingTarget}
          drawingPoints={drawingPoints}
          patternSegments={patternSegments}
          waypoints={waypoints}
          pendingDensityPreviewWaypoints={pendingDensityPreviewWaypoints}
          pendingDensityPreviewAnchorWaypoints={pendingDensityPreviewAnchorWaypoints}
          batteryReport={batteryReport}
          selectedWaypointId={selectedWaypointId}
          isClosedLoopMission={isClosedLoopMission}
          hoveredWaypointId={hoveredWaypointId}
          selectedPattern={selectedPattern}
          hoveredPattern={hoveredPattern}
          patternPickerVisible={patternPickerVisible}
          waypointContextMenuVisible={waypointContextMenuVisible}
          bulkAssignActionType={bulkAssignActionType}
          simulationSession={simulationSession}
          simulationCommand={simulationCommand}
          simulationSpeed={simulationSpeed}
          simulationFollowCamera={simulationFollowCamera}
          inputLocked={isAnimationLocked}
          skipAnimationToken={skipAnimationToken}
          onStartDrawing={onStartDrawing}
          draggingPointId={draggingPointId}
          onAddPoint={onAddPoint}
        onUpdatePoint={onUpdatePoint}
        onClosePolygon={onClosePolygon}
        onSelectWaypoint={onSelectWaypoint}
        onUpdateWaypointPosition={onUpdateWaypointPosition}
        onBulkAssignWaypoint={onBulkAssignWaypoint}
          onExitBulkAssign={onExitBulkAssign}
          onHoveredWaypointChange={onHoveredWaypointChange}
          onWaypointContextMenu={onWaypointContextMenu}
          onSelectExclusionZone={onSelectExclusionZone}
          onReadyToCloseChange={onReadyToCloseChange}
          onPatternPickerAnchorChange={onPatternPickerAnchorChange}
          onDraggingPointChange={setDraggingPointId}
          onPatternTransitionActiveChange={setIsPatternTransitionActive}
          onRouteRevealActiveChange={setIsRouteRevealActive}
          onWaypointDragActiveChange={setIsWaypointDragActive}
          onCursorChange={setViewportCursor}
          onSimulationTelemetryChange={onSimulationTelemetryChange}
          orbitControlsRef={orbitControlsRef}
          lastOrbitInteractionAtRef={lastOrbitInteractionAtRef}
        />
      </Suspense>

      <OrbitControls
        ref={(controls) => {
          orbitControlsRef.current = controls
        }}
        makeDefault
        enabled={
          draggingPointId === null &&
          !waypointContextMenuVisible &&
          !isAnimationLocked
        }
        enableDamping
        minDistance={MIN_CAMERA_DISTANCE}
        maxDistance={MAX_CAMERA_DISTANCE}
        minPolarAngle={DEFAULT_MIN_POLAR_ANGLE}
        maxPolarAngle={
          stage === 'drawing' ? DRAWING_MAX_POLAR_ANGLE : DEFAULT_MAX_POLAR_ANGLE
        }
        enablePan={
          stage !== 'drawing' &&
          !waypointContextMenuVisible &&
          !isAnimationLocked
        }
        onStart={() => {
          if (typeof performance !== 'undefined') {
            lastOrbitInteractionAtRef.current = performance.now()
          }
        }}
      />
      <DrawingCameraController
        stage={stage}
        scanAltitude={scanAltitude}
        points={drawingTarget === 'exclusion' ? drawingPoints : points}
        cameraTarget={cameraTarget}
        draggingPointId={draggingPointId}
        waypointContextMenuVisible={waypointContextMenuVisible}
        animationLocked={isAnimationLocked}
        orbitControlsRef={orbitControlsRef}
      />
      <GeneratedCameraController
        stage={stage}
        scanAltitude={scanAltitude}
        points={points}
        waypoints={waypoints}
        selectedWaypointId={selectedWaypointId}
        skipAnimationToken={skipAnimationToken}
        orbitControlsRef={orbitControlsRef}
        onRevealActiveChange={setIsGeneratedRevealActive}
      />
      <CameraDebugObserver
        orbitControlsRef={orbitControlsRef}
        onCameraDebugChange={onCameraDebugChange}
      />
    </Canvas>
  )
}

function CameraDebugObserver({
  orbitControlsRef,
  onCameraDebugChange,
}: {
  orbitControlsRef: React.RefObject<OrbitControlsHandle | null>
  onCameraDebugChange?: (snapshot: CameraDebugSnapshot | null) => void
}) {
  const { camera } = useThree()
  const lastPublishedAtRef = useRef(0)

  useEffect(() => {
    return () => {
      onCameraDebugChange?.(null)
    }
  }, [onCameraDebugChange])

  useFrame(() => {
    if (!onCameraDebugChange || !(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    const controls = orbitControlsRef.current

    if (!controls) {
      return
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()

    if (now - lastPublishedAtRef.current < 120) {
      return
    }

    lastPublishedAtRef.current = now

    const offset = camera.position.clone().sub(controls.target)
    const distance = offset.length()
    const polarDeg =
      distance === 0
        ? 0
        : THREE.MathUtils.radToDeg(
            Math.acos(THREE.MathUtils.clamp(offset.y / distance, -1, 1)),
          )
    const azimuthDeg = THREE.MathUtils.radToDeg(
      Math.atan2(offset.x, offset.z),
    )

    onCameraDebugChange({
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      target: {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      },
      distance,
      polarDeg,
      azimuthDeg,
      fov: camera.fov,
    })
  })

  return null
}

interface MissionWorldProps extends MissionViewport3DProps {
  inputLocked: boolean
  skipAnimationToken: number
  draggingPointId: number | null
  onDraggingPointChange: (id: number | null) => void
  onPatternTransitionActiveChange: (active: boolean) => void
  onRouteRevealActiveChange: (active: boolean) => void
  onWaypointDragActiveChange?: (active: boolean) => void
  onCursorChange?: (cursor: string) => void
  orbitControlsRef: React.RefObject<OrbitControlsHandle | null>
  lastOrbitInteractionAtRef: React.RefObject<number>
}

function MissionWorld({
  stage,
  scanAltitude,
  points,
  exclusionZones,
  activeExclusionZoneId,
  drawingTarget,
  drawingPoints,
  patternSegments,
  waypoints,
  pendingDensityPreviewWaypoints = null,
  pendingDensityPreviewAnchorWaypoints = null,
  batteryReport = null,
  selectedWaypointId,
  isClosedLoopMission,
  hoveredWaypointId = null,
  selectedPattern,
  hoveredPattern,
  patternPickerVisible,
  waypointContextMenuVisible = false,
  bulkAssignActionType = null,
  simulationSession = null,
  simulationCommand = null,
  simulationSpeed = 1,
  simulationFollowCamera = true,
  inputLocked,
  skipAnimationToken,
  onStartDrawing,
  draggingPointId,
  onAddPoint,
  onUpdatePoint,
  onClosePolygon,
  onSelectWaypoint,
  onUpdateWaypointPosition,
  onBulkAssignWaypoint,
  onExitBulkAssign,
  onHoveredWaypointChange,
  onWaypointContextMenu,
  onSelectExclusionZone,
  onReadyToCloseChange,
  onPatternPickerAnchorChange,
  onDraggingPointChange,
  onPatternTransitionActiveChange,
  onRouteRevealActiveChange,
  onWaypointDragActiveChange,
  onCursorChange,
  onSimulationTelemetryChange,
  orbitControlsRef,
  lastOrbitInteractionAtRef,
}: MissionWorldProps) {
  const { camera, gl } = useThree()
  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null)
  const [isReadyToClose, setIsReadyToClose] = useState(false)
  const [hoveredWaypointSphereId, setHoveredWaypointSphereId] = useState<number | null>(null)
  const [hoveredWaypointStemId, setHoveredWaypointStemId] = useState<number | null>(null)
  const [draggingWaypointXY, setDraggingWaypointXY] = useState<WaypointXYDragState | null>(
    null,
  )
  const [draggingWaypointZ, setDraggingWaypointZ] = useState<WaypointZDragState | null>(
    null,
  )
  const [previewTransition, setPreviewTransition] =
    useState<PreviewTransition | null>(null)
  const [routeRevealAnimation, setRouteRevealAnimation] =
    useState<TimedRevealAnimation | null>(null)
  const hoverSyncFrameRef = useRef<number | null>(null)
  const pendingHoverStateRef = useRef<{
    point: Vec2 | null
    readyToClose: boolean
  } | null>(null)
  const activePreviewPattern = stage === 'editing' ? hoveredPattern ?? selectedPattern : null
  const activePatternColor = activePreviewPattern
    ? getFlightPatternOption(activePreviewPattern).color
    : getFlightPatternOption(selectedPattern).color
  const selectedPatternColor = getFlightPatternOption(selectedPattern).color
  const previousSelectedPatternRef = useRef(selectedPattern)
  const previousStageRef = useRef(stage)
  const previousSkipTokenRef = useRef(skipAnimationToken)
  const settledPreviewSegmentsRef = useRef(patternSegments)
  const displayedPreviewSegments = useMemo(
    () => getDisplayedPreviewSegments(previewTransition, patternSegments),
    [patternSegments, previewTransition],
  )
  const visibleExclusionZones = useMemo(
    () => exclusionZones.filter((zone) => zone.points.length >= 3),
    [exclusionZones],
  )
  const previewSegmentColor = previewTransition
    ? getFlightPatternOption(
        previewTransition.phase === 'reveal'
          ? previewTransition.toPattern
          : previewTransition.fromPattern,
      ).color
    : activePatternColor
  const previewSegmentOpacity = previewTransition
    ? previewTransition.phase === 'fade-out'
      ? 0.84 * (1 - getPreviewPhaseProgress(previewTransition))
      : previewTransition.phase === 'hold'
        ? 0
        : 0.84
    : 0.84

  useEffect(() => {
    onReadyToCloseChange?.(isReadyToClose)
  }, [isReadyToClose, onReadyToCloseChange])

  useEffect(() => {
    return () => {
      if (hoverSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverSyncFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    onPatternTransitionActiveChange(previewTransition !== null)
  }, [onPatternTransitionActiveChange, previewTransition])

  useEffect(() => {
    onRouteRevealActiveChange(routeRevealAnimation !== null)
  }, [onRouteRevealActiveChange, routeRevealAnimation])

  useEffect(() => {
    if (stage !== 'editing' || patternPickerVisible || hoveredPattern !== null) {
      previousSelectedPatternRef.current = selectedPattern

      if (previewTransition === null) {
        return undefined
      }

      const frameId = window.requestAnimationFrame(() => {
        setPreviewTransition(null)
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    const previousSelectedPattern = previousSelectedPatternRef.current
    previousSelectedPatternRef.current = selectedPattern

    if (previousSelectedPattern === selectedPattern) {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      setPreviewTransition({
        phase: 'fade-out',
        elapsed: 0,
        fromPattern: previousSelectedPattern,
        toPattern: selectedPattern,
        fromSegments: settledPreviewSegmentsRef.current,
        toSegments: patternSegments,
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [
    hoveredPattern,
    patternPickerVisible,
    patternSegments,
    previewTransition,
    selectedPattern,
    stage,
  ])

  useEffect(() => {
    if (
      stage === 'editing' &&
      !patternPickerVisible &&
      hoveredPattern === null &&
      previewTransition === null
    ) {
      settledPreviewSegmentsRef.current = patternSegments
    }
  }, [hoveredPattern, patternPickerVisible, patternSegments, previewTransition, stage])

  useEffect(() => {
    const previousStage = previousStageRef.current
    previousStageRef.current = stage

    if (stage !== 'generated') {
      if (routeRevealAnimation === null) {
        return undefined
      }

      const frameId = window.requestAnimationFrame(() => {
        setRouteRevealAnimation(null)
      })

      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    if (previousStage === 'generated' || waypoints.length === 0) {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      setRouteRevealAnimation({
        elapsed: 0,
        duration: GENERATED_ROUTE_REVEAL_DURATION,
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [routeRevealAnimation, stage, waypoints.length])

  useEffect(() => {
    if (skipAnimationToken === previousSkipTokenRef.current) {
      return
    }

    previousSkipTokenRef.current = skipAnimationToken

    const frameIds: number[] = []

    if (previewTransition) {
      settledPreviewSegmentsRef.current = previewTransition.toSegments
      frameIds.push(
        window.requestAnimationFrame(() => {
          setPreviewTransition(null)
        }),
      )
    }

    if (routeRevealAnimation) {
      frameIds.push(
        window.requestAnimationFrame(() => {
          setRouteRevealAnimation(null)
        }),
      )
    }

    return () => {
      frameIds.forEach((frameId) => window.cancelAnimationFrame(frameId))
    }
  }, [previewTransition, routeRevealAnimation, skipAnimationToken])

  useFrame((_, delta) => {
    if (previewTransition) {
      const nextElapsed = previewTransition.elapsed + delta

      if (
        previewTransition.phase === 'fade-out' &&
        nextElapsed >= PREVIEW_FADE_OUT_DURATION
      ) {
        setPreviewTransition({
          ...previewTransition,
          phase: 'hold',
          elapsed: 0,
        })
        return
      }

      if (
        previewTransition.phase === 'hold' &&
        nextElapsed >= PREVIEW_GAP_DURATION
      ) {
        setPreviewTransition({
          ...previewTransition,
          phase: 'reveal',
          elapsed: 0,
        })
        return
      }

      if (
        previewTransition.phase === 'reveal' &&
        nextElapsed >= PREVIEW_REVEAL_DURATION
      ) {
        settledPreviewSegmentsRef.current = previewTransition.toSegments
        setPreviewTransition(null)
        return
      }

      setPreviewTransition({
        ...previewTransition,
        elapsed: nextElapsed,
      })
    }

    if (routeRevealAnimation) {
      const nextElapsed = routeRevealAnimation.elapsed + delta

      if (nextElapsed >= routeRevealAnimation.duration) {
        setRouteRevealAnimation(null)
        return
      }

      setRouteRevealAnimation({
        ...routeRevealAnimation,
        elapsed: nextElapsed,
      })
    }
  })

  useEffect(() => {
    if (draggingPointId === null) {
      return undefined
    }

    const activePointId = draggingPointId
    const raycaster = new THREE.Raycaster()
    const altitudePlane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -scanAltitude,
    )
    const hitPoint = new THREE.Vector3()
    let pendingPoint: Vec2 | null = null
    let frameId: number | null = null

    function flushPendingPoint() {
      if (!pendingPoint) {
        return
      }

      const nextPoint = pendingPoint
      pendingPoint = null
      onUpdatePoint(activePointId, nextPoint.x, nextPoint.y)
    }

    function schedulePointFlush() {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        flushPendingPoint()
      })
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = gl.domElement.getBoundingClientRect()

      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        return
      }

      const pointer = new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      )

      raycaster.setFromCamera(pointer, camera)

      if (!raycaster.ray.intersectPlane(altitudePlane, hitPoint)) {
        return
      }

      pendingPoint = clampScenePoint(hitPoint)
      schedulePointFlush()
    }

    function handlePointerUp() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }

      flushPendingPoint()
      onDraggingPointChange(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [camera, draggingPointId, gl, onDraggingPointChange, onUpdatePoint, scanAltitude])

  useEffect(() => {
    if (stage === 'generated') {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      setHoveredWaypointSphereId(null)
      setHoveredWaypointStemId(null)
      setDraggingWaypointXY(null)
      setDraggingWaypointZ(null)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [stage])

  useEffect(() => {
    const isHoveredSelectedSphere =
      selectedWaypointId !== null && hoveredWaypointSphereId === selectedWaypointId
    const isHoveredSelectedStem =
      selectedWaypointId !== null && hoveredWaypointStemId === selectedWaypointId
    const nextCursor =
      stage !== 'generated' || inputLocked
        ? ''
        : draggingWaypointZ
          ? 'ns-resize'
          : draggingWaypointXY
            ? 'grabbing'
            : isHoveredSelectedStem
              ? 'ns-resize'
              : isHoveredSelectedSphere
                ? 'grab'
                : ''

    onCursorChange?.(nextCursor)

    return () => {
      onCursorChange?.('')
    }
  }, [
    draggingWaypointXY,
    draggingWaypointZ,
    selectedWaypointId,
    hoveredWaypointSphereId,
    hoveredWaypointStemId,
    inputLocked,
    onCursorChange,
    stage,
  ])

  useEffect(() => {
    if (!draggingWaypointXY || !onUpdateWaypointPosition) {
      return undefined
    }

    const activeWaypoint = draggingWaypointXY
    const updateWaypointPosition = onUpdateWaypointPosition
    const raycaster = new THREE.Raycaster()
    const altitudePlane = new THREE.Plane(
      new THREE.Vector3(0, 1, 0),
      -activeWaypoint.altitude,
    )
    const hitPoint = new THREE.Vector3()
    const controls = orbitControlsRef.current
    const restoreControls = controls
      ? {
          enabled: controls.enabled,
          enablePan: controls.enablePan,
          enableRotate: controls.enableRotate,
          enableZoom: controls.enableZoom,
        }
      : null
    let pendingPatch: WaypointPositionPatch | null = null
    let pendingCursor: { x: number; y: number } | null = null
    let frameId: number | null = null

    if (controls) {
      controls.enabled = false
      controls.enablePan = false
      controls.enableRotate = false
      controls.enableZoom = false
      controls.update()
    }

    function flushPendingUpdate() {
      if (pendingPatch) {
        updateWaypointPosition(activeWaypoint.waypointId, pendingPatch)
        pendingPatch = null
      }

      if (pendingCursor) {
        const nextCursor = pendingCursor
        pendingCursor = null
        setDraggingWaypointXY((current) =>
          current?.waypointId === activeWaypoint.waypointId
            ? {
                ...current,
                clientX: nextCursor.x,
                clientY: nextCursor.y,
              }
            : current,
        )
      }
    }

    function scheduleUpdateFlush() {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        flushPendingUpdate()
      })
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = gl.domElement.getBoundingClientRect()

      const pointer = new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      )

      raycaster.setFromCamera(pointer, camera)

      if (!raycaster.ray.intersectPlane(altitudePlane, hitPoint)) {
        return
      }

      const nextPoint = clampScenePoint(hitPoint)
      pendingPatch = { x: nextPoint.x, y: nextPoint.y }
      pendingCursor = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      }
      scheduleUpdateFlush()
    }

    function handlePointerUp() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }

      flushPendingUpdate()
      setDraggingWaypointXY(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      if (restoreControls && controls) {
        controls.enabled = restoreControls.enabled
        controls.enablePan = restoreControls.enablePan
        controls.enableRotate = restoreControls.enableRotate
        controls.enableZoom = restoreControls.enableZoom
        controls.update()
      }

      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [camera, draggingWaypointXY, gl, onUpdateWaypointPosition, orbitControlsRef])

  useEffect(() => {
    if (!draggingWaypointZ || !onUpdateWaypointPosition) {
      return undefined
    }

    const activeWaypoint = draggingWaypointZ
    const updateWaypointPosition = onUpdateWaypointPosition
    const controls = orbitControlsRef.current
    const restoreControls = controls
      ? {
          enabled: controls.enabled,
          enablePan: controls.enablePan,
          enableRotate: controls.enableRotate,
          enableZoom: controls.enableZoom,
        }
      : null
    let pendingPatch: WaypointPositionPatch | null = null
    let pendingDragMeta:
      | {
          clientX: number
          clientY: number
          clampState: 'none' | 'min' | 'max'
          snapActive: boolean
        }
      | null = null
    let frameId: number | null = null

    if (controls) {
      controls.enabled = false
      controls.enablePan = false
      controls.enableRotate = false
      controls.enableZoom = false
      controls.update()
    }

    function flushPendingUpdate() {
      if (pendingPatch) {
        updateWaypointPosition(activeWaypoint.waypointId, pendingPatch)
        pendingPatch = null
      }

      if (pendingDragMeta) {
        const nextMeta = pendingDragMeta
        pendingDragMeta = null
        setDraggingWaypointZ((current) =>
          current?.waypointId === activeWaypoint.waypointId
            ? {
                ...current,
                clientX: nextMeta.clientX,
                clientY: nextMeta.clientY,
                clampState: nextMeta.clampState,
                snapActive: nextMeta.snapActive,
              }
            : current,
        )
      }
    }

    function scheduleUpdateFlush() {
      if (frameId !== null) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        flushPendingUpdate()
      })
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = gl.domElement.getBoundingClientRect()
      const deltaPixels = activeWaypoint.startClientY - event.clientY
      const rawAltitude =
        activeWaypoint.start.z + deltaPixels * activeWaypoint.metersPerPixel
      const snappedAltitude = event.shiftKey
        ? Math.round(rawAltitude / 5) * 5
        : rawAltitude
      const nextAltitude = Math.min(
        WAYPOINT_DRAG_MAX_ALTITUDE,
        Math.max(WAYPOINT_DRAG_MIN_ALTITUDE, snappedAltitude),
      )

      pendingPatch = { z: nextAltitude }
      pendingDragMeta = {
        clientX: event.clientX - bounds.left,
        clientY: event.clientY - bounds.top,
        clampState: getWaypointDragClampState(nextAltitude),
        snapActive: event.shiftKey,
      }
      scheduleUpdateFlush()
    }

    function handlePointerUp() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }

      flushPendingUpdate()
      setDraggingWaypointZ(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      if (restoreControls && controls) {
        controls.enabled = restoreControls.enabled
        controls.enablePan = restoreControls.enablePan
        controls.enableRotate = restoreControls.enableRotate
        controls.enableZoom = restoreControls.enableZoom
        controls.update()
      }

      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingWaypointZ, gl, onUpdateWaypointPosition, orbitControlsRef])

  const canClosePolygon = stage === 'drawing' && drawingPoints.length >= 3
  const isPlaneInteractive = stage === 'setup' || stage === 'drawing'
  const applyHoverState = useCallback((point: Vec2 | null, readyToClose: boolean) => {
    if (hoverSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverSyncFrameRef.current)
      hoverSyncFrameRef.current = null
    }

    pendingHoverStateRef.current = null
    setHoverPoint(point)
    setIsReadyToClose(readyToClose)
  }, [])
  const scheduleHoverState = useCallback((point: Vec2 | null, readyToClose: boolean) => {
    pendingHoverStateRef.current = { point, readyToClose }

    if (hoverSyncFrameRef.current !== null) {
      return
    }

    hoverSyncFrameRef.current = window.requestAnimationFrame(() => {
      hoverSyncFrameRef.current = null

      const pendingState = pendingHoverStateRef.current
      pendingHoverStateRef.current = null

      if (!pendingState) {
        return
      }

      setHoverPoint((current) =>
        arePointsEquivalent(current, pendingState.point) ? current : pendingState.point,
      )
      setIsReadyToClose((current) =>
        current === pendingState.readyToClose ? current : pendingState.readyToClose,
      )
    })
  }, [])
  const previewPolylinePoints = useMemo(() => {
    if (drawingPoints.length === 0) {
      return [] as ScenePoint[]
    }

    const polyline = drawingPoints.map((point) =>
      toAltitudePlanePosition(point, scanAltitude, ALTITUDE_LINE_OFFSET),
    )

    const snappedPreviewPoint = isReadyToClose ? drawingPoints[0] : hoverPoint

    if (isPlaneInteractive && snappedPreviewPoint) {
      return [
        ...polyline,
        toAltitudePlanePosition(
          snappedPreviewPoint,
          scanAltitude,
          ALTITUDE_LINE_OFFSET,
        ),
      ]
    }

    if (stage !== 'drawing' && drawingPoints.length >= 3) {
      return [
        ...polyline,
        toAltitudePlanePosition(drawingPoints[0], scanAltitude, ALTITUDE_LINE_OFFSET),
      ]
    }

    return polyline
  }, [drawingPoints, hoverPoint, isPlaneInteractive, isReadyToClose, scanAltitude, stage])
  const hoverLinkPoints = useMemo(() => {
    if (!canClosePolygon || !hoverPoint || drawingPoints.length === 0 || isReadyToClose) {
      return null
    }

    return [
      toAltitudePlanePosition(hoverPoint, scanAltitude, ALTITUDE_LINE_OFFSET),
      toAltitudePlanePosition(drawingPoints[0], scanAltitude, ALTITUDE_LINE_OFFSET),
    ]
  }, [canClosePolygon, drawingPoints, hoverPoint, isReadyToClose, scanAltitude])
  const boundaryShape = useMemo(() => {
    if (points.length < 3) {
      return null
    }

    return buildPolygonShape(points)
  }, [points])
  const drawingShape = useMemo(() => {
    if (drawingPoints.length < 3) {
      return null
    }

    return buildPolygonShape(drawingPoints)
  }, [drawingPoints])
  const waypointBatteryEstimates = useMemo(
    () => batteryReport?.waypointEstimates ?? [],
    [batteryReport],
  )
  const waypointBatteryEstimateMap = useMemo(
    () =>
      new Map(
        waypointBatteryEstimates.map((estimate) => [estimate.waypointId, estimate] as const),
      ),
    [waypointBatteryEstimates],
  )
  const revealedWaypoints = useMemo(
    () => getRevealedWaypoints(waypoints, routeRevealAnimation),
    [routeRevealAnimation, waypoints],
  )
  const currentAnchorWaypoints = useMemo(
    () => waypoints.filter((waypoint) => waypoint.role === 'anchor'),
    [waypoints],
  )
  const pendingDensityPreviewSegments = useMemo(
    () =>
      pendingDensityPreviewWaypoints
        ? buildWaypointSegments(pendingDensityPreviewWaypoints)
        : [],
    [pendingDensityPreviewWaypoints],
  )
  const ghostRemovedAnchors = useMemo(
    () => {
      if (!pendingDensityPreviewAnchorWaypoints) {
        return []
      }

      const nextAnchorKeys = new Set(
        pendingDensityPreviewAnchorWaypoints.map((waypoint) => getWaypointSceneKey(waypoint)),
      )

      return currentAnchorWaypoints.filter(
        (waypoint) => !nextAnchorKeys.has(getWaypointSceneKey(waypoint)),
      )
    },
    [currentAnchorWaypoints, pendingDensityPreviewAnchorWaypoints],
  )
  const revealedRouteSegments = useMemo(
    () => buildWaypointSegments(revealedWaypoints),
    [revealedWaypoints],
  )
  const revealedColoredRouteSegments = useMemo(
    () =>
      buildColoredRouteSegments({
        waypoints: revealedWaypoints,
        waypointEstimateMap: waypointBatteryEstimateMap,
      }),
    [revealedWaypoints, waypointBatteryEstimateMap],
  )
  const routeDirectionChevrons = useMemo(
    () => buildRouteDirectionChevrons(revealedRouteSegments, scanAltitude),
    [revealedRouteSegments, scanAltitude],
  )
  const selectedWaypoint =
    selectedWaypointId === null
      ? null
      : waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null
  const draggedWaypointXYCurrent =
    draggingWaypointXY === null
      ? null
      : waypoints.find((waypoint) => waypoint.id === draggingWaypointXY.waypointId) ??
        draggingWaypointXY.start
  const draggedWaypointZCurrent =
    draggingWaypointZ === null
      ? null
      : waypoints.find((waypoint) => waypoint.id === draggingWaypointZ.waypointId) ??
        draggingWaypointZ.start
  const activeWaypointTooltip = useMemo(() => {
    if (draggingWaypointXY && draggedWaypointXYCurrent) {
      return {
        mode: 'xy' as const,
        waypoint: draggedWaypointXYCurrent,
        title: `Waypoint ${draggedWaypointXYCurrent.id} · Move`,
        lines: [
          {
            label: 'X',
            value: `${formatDragNumber(draggingWaypointXY.start.x)}m -> ${formatDragNumber(
              draggedWaypointXYCurrent.x,
            )}m`,
            delta: formatSignedDistance(
              draggedWaypointXYCurrent.x - draggingWaypointXY.start.x,
            ),
            active: true,
          },
          {
            label: 'Y',
            value: `${formatDragNumber(draggingWaypointXY.start.y)}m -> ${formatDragNumber(
              draggedWaypointXYCurrent.y,
            )}m`,
            delta: formatSignedDistance(
              draggedWaypointXYCurrent.y - draggingWaypointXY.start.y,
            ),
            active: true,
          },
          {
            label: 'Z',
            value: `${formatDragNumber(draggedWaypointXYCurrent.z)}m`,
            delta: null,
            active: false,
          },
        ],
        clampState: 'none' as const,
        snapActive: false,
      }
    }

    if (draggingWaypointZ && draggedWaypointZCurrent) {
      return {
        mode: 'z' as const,
        waypoint: draggedWaypointZCurrent,
        title: `Waypoint ${draggedWaypointZCurrent.id} · Altitude`,
        lines: [
          {
            label: 'X',
            value: `${formatDragNumber(draggedWaypointZCurrent.x)}m`,
            delta: null,
            active: false,
          },
          {
            label: 'Y',
            value: `${formatDragNumber(draggedWaypointZCurrent.y)}m`,
            delta: null,
            active: false,
          },
          {
            label: 'Z',
            value: `${formatDragNumber(draggingWaypointZ.start.z)}m -> ${formatDragNumber(
              draggedWaypointZCurrent.z,
            )}m`,
            delta: formatSignedDistance(
              draggedWaypointZCurrent.z - draggingWaypointZ.start.z,
            ),
            active: true,
          },
        ],
        clampState: draggingWaypointZ.clampState,
        snapActive: draggingWaypointZ.snapActive,
      }
    }

    if (selectedWaypoint) {
      return {
        mode: 'selected' as const,
        waypoint: selectedWaypoint,
        title: `Waypoint ${selectedWaypoint.id}`,
        lines: [
          {
            label: 'X',
            value: `${formatDragNumber(selectedWaypoint.x)}m`,
            delta: null,
            active: false,
          },
          {
            label: 'Y',
            value: `${formatDragNumber(selectedWaypoint.y)}m`,
            delta: null,
            active: false,
          },
          {
            label: 'Z',
            value: `${formatDragNumber(selectedWaypoint.z)}m`,
            delta: null,
            active: false,
          },
        ],
        clampState: 'none' as const,
        snapActive: false,
      }
    }

    return null
  }, [
    draggedWaypointXYCurrent,
    draggedWaypointZCurrent,
    draggingWaypointXY,
    draggingWaypointZ,
    selectedWaypoint,
  ])
  const isWaypointDragActive =
    draggingWaypointXY !== null || draggingWaypointZ !== null

  useEffect(() => {
    onWaypointDragActiveChange?.(isWaypointDragActive)

    return () => {
      onWaypointDragActiveChange?.(false)
    }
  }, [isWaypointDragActive, onWaypointDragActiveChange])

  const isClosedLoopPattern =
    isClosedLoopMission ?? (getStartWaypointPolicy(selectedPattern) === 'closed-rotatable')
  const startWaypointId = waypoints[0]?.id ?? null
  const endWaypointId =
    !isClosedLoopPattern && waypoints.length > 1
      ? waypoints[waypoints.length - 1]?.id ?? null
      : null
  const pointOfNoReturnId = batteryReport?.pointOfNoReturn ?? null
  const interactionCameraTarget =
    drawingTarget === 'exclusion' && drawingPoints.length > 0
      ? polygonCentroid(drawingPoints)
      : points.length > 0
        ? polygonCentroid(points)
        : waypoints.length > 0
          ? polygonCentroid(waypoints)
          : WORLD_CENTER
  const cameraPolarDeg = getCameraPolarAngleDeg(
    camera.position,
    new THREE.Vector3(
      interactionCameraTarget.x,
      scanAltitude,
      interactionCameraTarget.y,
    ),
  )

  const flightAnchor = useMemo(() => {
    if (selectedWaypoint) {
      return selectedWaypoint
    }

    if (waypoints.length > 0) {
      return waypoints[0]
    }

    if (points.length > 0) {
      const center = polygonCentroid(points)

      return {
        id: 0,
        x: center.x,
        y: center.y,
        z: scanAltitude,
      }
    }

    return {
      id: 0,
      x: 0,
      y: 0,
      z: scanAltitude,
    }
  }, [points, scanAltitude, selectedWaypoint, waypoints])

  function handleAltitudePlaneMove(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation()

    if (!isPlaneInteractive) {
      return
    }

    const nextHoverPoint = clampScenePoint(event.point)
    const nextReadyToClose =
      canClosePolygon &&
      drawingPoints.length > 0 &&
      isWithinCloseSnapRadius({
        camera,
        bounds: gl.domElement.getBoundingClientRect(),
        clientX: event.clientX,
        clientY: event.clientY,
        point: drawingPoints[0],
        altitude: scanAltitude,
      })

    scheduleHoverState(nextHoverPoint, nextReadyToClose)
  }

  function handleAltitudePlaneClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()

    if (inputLocked) {
      return
    }

    if (waypointContextMenuVisible) {
      return
    }

    if (!isPrimaryClickGesture(event)) {
      return
    }

    if (stage === 'setup') {
      const nextPoint = clampScenePoint(event.point)
      applyHoverState(null, false)
      onStartDrawing()
      onAddPoint(nextPoint.x, nextPoint.y)
      return
    }

    if (stage === 'drawing') {
      if (isReadyToClose && canClosePolygon) {
        applyHoverState(null, false)
        onClosePolygon()
        return
      }

      const nextPoint = clampScenePoint(event.point)
      applyHoverState(null, false)
      onAddPoint(nextPoint.x, nextPoint.y)
      return
    }

    if (stage === 'generated') {
      if (bulkAssignActionType) {
        return
      }

      onHoveredWaypointChange?.(null)
      onSelectWaypoint(null)
    }
  }

  function handleVertexPointerDown(
    event: ThreeEvent<PointerEvent>,
    pointId: number,
  ) {
    if (stage !== 'editing' || inputLocked) {
      return
    }

    event.stopPropagation()
    applyHoverState(null, false)
    onDraggingPointChange(pointId)
  }

  function handleGeneratedWaypointSpherePointerDown(
    event: ThreeEvent<PointerEvent>,
    waypoint: MissionWaypoint,
  ) {
    if (
      stage !== 'generated' ||
      inputLocked ||
      bulkAssignActionType ||
      waypointContextMenuVisible ||
      draggingWaypointZ ||
      !onUpdateWaypointPosition ||
      selectedWaypointId !== waypoint.id
    ) {
      return
    }

    if (event.button !== 0) {
      return
    }

    event.stopPropagation()
    setHoveredWaypointSphereId(waypoint.id)
    setDraggingWaypointXY({
      waypointId: waypoint.id,
      start: waypoint,
      altitude: waypoint.z,
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }

  function handleGeneratedWaypointStemPointerDown(
    event: ThreeEvent<PointerEvent>,
    waypoint: MissionWaypoint,
  ) {
    if (
      stage !== 'generated' ||
      inputLocked ||
      bulkAssignActionType ||
      waypointContextMenuVisible ||
      draggingWaypointXY ||
      !onUpdateWaypointPosition ||
      selectedWaypointId !== waypoint.id
    ) {
      return
    }

    if (event.button !== 0) {
      return
    }

    event.stopPropagation()

    const cameraDistance = camera.position.distanceTo(
      new THREE.Vector3(...toAltitudeMarkerPosition(waypoint, waypoint.z)),
    )
    const polarDeg = getCameraPolarAngleDeg(camera.position, orbitControlsRef.current?.target ?? null)

    setHoveredWaypointStemId(waypoint.id)
    setDraggingWaypointZ({
      waypointId: waypoint.id,
      start: waypoint,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      metersPerPixel: calculateWaypointZMetersPerPixel(cameraDistance),
      clampState: 'none',
      snapActive: event.shiftKey,
    })

    if (polarDeg < 30) {
      onHoveredWaypointChange?.(waypoint.id)
    }
  }

  function handleVertexClick(
    event: ThreeEvent<MouseEvent>,
    pointIndex: number,
  ) {
    if (inputLocked) {
      return
    }

    event.stopPropagation()

    if (!isPrimaryClickGesture(event)) {
      return
    }

    if (pointIndex === 0 && canClosePolygon) {
      applyHoverState(null, false)
      onClosePolygon()
    }
  }

  return (
    <>
      <ambientLight intensity={1.05} />
      <hemisphereLight intensity={0.7} color="#ffffff" groundColor="#8fa0b8" />
      <directionalLight position={[96, 180, 72]} intensity={1.12} />

      <PatternPickerAnchorObserver
        visible={patternPickerVisible}
        points={points}
        altitude={scanAltitude}
        onAnchorChange={onPatternPickerAnchorChange}
      />

      <mesh rotation-x={-Math.PI / 2} position={[0, -1.6, 0]}>
        <planeGeometry
          args={[WORLD_DIMENSIONS.width * 2.05, WORLD_DIMENSIONS.height * 2.05]}
        />
        <meshStandardMaterial color="#cad6e3" />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <planeGeometry args={[WORLD_DIMENSIONS.width, WORLD_DIMENSIONS.height]} />
        <meshStandardMaterial
          color={stage === 'idle' ? '#dbe5ef' : '#ece8ff'}
          transparent
          opacity={stage === 'idle' ? 0.88 : 0.94}
        />
      </mesh>

      <Grid
        position={[0, GROUND_SURFACE_HEIGHT + 0.02, 0]}
        args={[WORLD_DIMENSIONS.width, WORLD_DIMENSIONS.height]}
        cellColor="#9a87f4"
        cellSize={12}
        cellThickness={0.45}
        fadeDistance={360}
        fadeStrength={1.25}
        infiniteGrid={false}
        sectionColor="#7866ed"
        sectionSize={60}
        sectionThickness={0.9}
      />

      <Line
        points={getRectBorder(GROUND_SURFACE_HEIGHT)}
        color="#7d6af1"
        transparent
        opacity={stage === 'idle' ? 0.2 : 0.35}
      />

      {stage !== 'idle' && (
        <>
          <mesh
            rotation-x={-Math.PI / 2}
            position={[0, scanAltitude, 0]}
            onPointerMove={handleAltitudePlaneMove}
            onPointerLeave={() => {
              if (draggingPointId === null) {
                applyHoverState(null, false)
              }
            }}
            onClick={handleAltitudePlaneClick}
          >
            <planeGeometry args={[WORLD_DIMENSIONS.width, WORLD_DIMENSIONS.height]} />
            <meshStandardMaterial
              color={drawingTarget === 'exclusion' ? '#f97316' : '#8b5cf6'}
              transparent
              opacity={stage === 'setup' ? 0.14 : drawingTarget === 'exclusion' ? 0.1 : 0.08}
            />
          </mesh>

          <Grid
            position={[0, scanAltitude + ALTITUDE_PLANE_GRID_OFFSET, 0]}
            args={[WORLD_DIMENSIONS.width, WORLD_DIMENSIONS.height]}
            cellColor={drawingTarget === 'exclusion' ? '#fb923c' : '#7c6bff'}
            cellSize={12}
            cellThickness={0.55}
            fadeDistance={360}
            fadeStrength={1.2}
            infiniteGrid={false}
            sectionColor={drawingTarget === 'exclusion' ? '#f97316' : '#5b21f0'}
            sectionSize={60}
            sectionThickness={1}
          />

          <Line
            points={getRectBorder(scanAltitude + ALTITUDE_PLANE_GRID_OFFSET)}
            color={drawingTarget === 'exclusion' ? '#ea580c' : '#6d28d9'}
            transparent
            opacity={stage === 'setup' ? 0.7 : 0.5}
            lineWidth={1.6}
          />
        </>
      )}

      {boundaryShape &&
        stage !== 'idle' &&
        (stage !== 'drawing' || drawingTarget === 'exclusion' || isReadyToClose) && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, scanAltitude + ALTITUDE_PLANE_FILL_OFFSET, 0]}
        >
          <shapeGeometry args={[boundaryShape]} />
          <meshStandardMaterial
            color={stage === 'generated' ? selectedPatternColor : activePatternColor}
            transparent
            opacity={
              drawingTarget === 'exclusion' && stage === 'drawing'
                ? 0.08
                : stage === 'generated'
                  ? 0.14
                  : 0.2
            }
          />
        </mesh>
      )}

      {visibleExclusionZones.map((zone) => (
        <ExclusionZoneMesh
          key={`zone-${zone.id}`}
          zone={zone}
          altitude={scanAltitude}
          isActive={activeExclusionZoneId === zone.id && drawingTarget !== 'exclusion'}
          onSelect={
            stage === 'editing' || stage === 'generated'
              ? onSelectExclusionZone
              : undefined
          }
        />
      ))}

      {drawingTarget === 'exclusion' && drawingShape && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, scanAltitude + ALTITUDE_PLANE_FILL_OFFSET * 1.35, 0]}
        >
          <shapeGeometry args={[drawingShape]} />
          <meshStandardMaterial
            color="#f97316"
            transparent
            opacity={isReadyToClose ? 0.16 : 0.2}
          />
        </mesh>
      )}

      {(stage === 'drawing' || stage === 'editing') && previewPolylinePoints.length >= 2 && (
        <Line
          points={previewPolylinePoints}
          color={
            drawingTarget === 'exclusion'
              ? '#f97316'
              : stage === 'editing'
                ? activePatternColor
                : '#7c6bff'
          }
          lineWidth={2.2}
          dashed={stage === 'drawing'}
          dashSize={4}
          gapSize={3}
        />
      )}

      {hoverLinkPoints && (
        <Line
          points={hoverLinkPoints}
          color={drawingTarget === 'exclusion' ? '#f97316' : activePatternColor}
          transparent
          opacity={0.62}
          dashed
          dashSize={3}
          gapSize={3}
        />
      )}

      {stage === 'editing' &&
        displayedPreviewSegments.map(([start, end], index) => (
          <Line
            key={`pattern-segment-${index}`}
            points={[
              toAltitudePlanePosition(start, scanAltitude, ALTITUDE_LINE_OFFSET),
              toAltitudePlanePosition(end, scanAltitude, ALTITUDE_LINE_OFFSET),
            ]}
            color={previewSegmentColor}
            transparent
            opacity={previewSegmentOpacity}
            dashed
            dashSize={4}
            gapSize={3}
          />
        ))}

      {stage === 'editing' &&
        activePreviewPattern &&
        !getFlightPatternOption(activePreviewPattern).implemented && (
        <PatternPreviewOverlay
          pattern={activePreviewPattern}
          points={points}
          altitude={scanAltitude}
        />
        )}

      {stage === 'editing' && activePreviewPattern && (
        <PatternVisualPolish
          pattern={activePreviewPattern}
          color={activePatternColor}
          points={points}
          segments={displayedPreviewSegments}
          waypoints={[]}
          altitude={scanAltitude}
          mode="preview"
        />
      )}

      {stage === 'generated' &&
        revealedWaypoints.map((waypoint) => {
          const isSelected = selectedWaypointId === waypoint.id
          const isStemHovered = hoveredWaypointStemId === waypoint.id
          const isStemDragging = draggingWaypointZ?.waypointId === waypoint.id
          const isStemEditableHover = isSelected && isStemHovered
          const markerPosition = toAltitudeMarkerPosition(waypoint, waypoint.z)
          const markerVector = new THREE.Vector3(...markerPosition)
          const cameraDistance = camera.position.distanceTo(markerVector)
          const stemHitboxRadius = calculateWaypointStemHitboxRadius(
            cameraDistance,
            cameraPolarDeg,
          )
          const stemHitboxHeight = calculateWaypointStemHitboxHeight(
            waypoint.z,
            ALTITUDE_MARKER_LIFT,
            GROUND_SURFACE_HEIGHT,
          )
          const stemBottomOffset =
            GROUND_SURFACE_HEIGHT - (waypoint.z + ALTITUDE_MARKER_LIFT)
          const stemMidY = stemBottomOffset / 2

          return (
            <group key={`stem-${waypoint.id}`} position={markerPosition}>
              {(isStemEditableHover || isStemDragging) && (
                <Line
                  points={[
                    [0, stemBottomOffset, 0],
                    [0, 0, 0],
                  ]}
                  color="#3b82f6"
                  transparent
                  opacity={isStemDragging ? 1 : 0.92}
                  lineWidth={2.8}
                />
              )}

              {!inputLocked &&
                !bulkAssignActionType &&
                !waypointContextMenuVisible && (
                  <mesh
                    position={[0, stemMidY, 0]}
                    onPointerEnter={(event) => {
                      event.stopPropagation()
                      setHoveredWaypointStemId(waypoint.id)
                    }}
                    onPointerLeave={(event) => {
                      event.stopPropagation()

                      if (draggingWaypointZ?.waypointId !== waypoint.id) {
                        setHoveredWaypointStemId((current) =>
                          current === waypoint.id ? null : current,
                        )
                      }
                    }}
                    onClick={(event) => {
                      event.stopPropagation()

                      if (inputLocked || bulkAssignActionType || isWaypointDragActive) {
                        return
                      }

                      onSelectWaypoint(waypoint.id)
                    }}
                    onPointerDown={(event) =>
                      handleGeneratedWaypointStemPointerDown(event, waypoint)
                    }
                  >
                    <cylinderGeometry
                      args={[
                        stemHitboxRadius,
                        stemHitboxRadius,
                        stemHitboxHeight,
                        10,
                      ]}
                    />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                )}

              {(isStemEditableHover || isStemDragging) && (
                <Billboard position={[0, stemMidY + 4.6, 0]} follow>
                  <mesh>
                    <planeGeometry args={[12.4, 4.2]} />
                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.94} />
                  </mesh>
                  <Text
                    position={[0, 0, 0.05]}
                    fontSize={1.7}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="middle"
                  >
                    {`\u2195 ${formatDragNumber(waypoint.z)}m`}
                  </Text>
                </Billboard>
              )}

              {isStemDragging && (
                <mesh
                  rotation-x={-Math.PI / 2}
                  position={[0, stemBottomOffset + 0.16, 0]}
                >
                  <ringGeometry args={[2.4, 3.2, 32]} />
                  <meshBasicMaterial color="#3b82f6" transparent opacity={0.18} />
                </mesh>
              )}
            </group>
          )
        })}

      {stage === 'generated' &&
        revealedColoredRouteSegments.map((segment, index) => (
          <Line
            key={`route-segment-${index}`}
            points={segment.points}
            color={segment.color}
            lineWidth={3.2}
          />
        ))}

      {stage === 'generated' &&
        pendingDensityPreviewSegments.map(([start, end], index) => (
          <Line
            key={`density-preview-segment-${index}`}
            points={[
              toAltitudePlanePosition(start, scanAltitude, ALTITUDE_LINE_OFFSET + 0.22),
              toAltitudePlanePosition(end, scanAltitude, ALTITUDE_LINE_OFFSET + 0.22),
            ]}
            color={selectedPatternColor}
            transparent
            opacity={0.94}
            lineWidth={2.4}
          />
        ))}

      {stage === 'generated' &&
        routeDirectionChevrons.map((chevron, index) => (
          <Line
            key={`route-chevron-${index}`}
            points={chevron}
            color={selectedPatternColor}
            transparent
            opacity={0.58}
            lineWidth={1.6}
          />
        ))}

      <DroneSimulationLayer
        session={simulationSession}
        command={simulationCommand}
        speed={simulationSpeed}
        followCamera={simulationFollowCamera}
        altitude={scanAltitude}
        color={stage === 'generated' ? selectedPatternColor : activePatternColor}
        inputLocked={inputLocked}
        orbitControlsRef={orbitControlsRef}
        lastOrbitInteractionAtRef={lastOrbitInteractionAtRef}
        onTelemetryChange={onSimulationTelemetryChange}
      />

      {stage === 'generated' && (
        <PatternVisualPolish
          pattern={selectedPattern}
          color={selectedPatternColor}
          points={points}
          segments={revealedRouteSegments}
          waypoints={revealedWaypoints}
          altitude={scanAltitude}
          mode="generated"
        />
      )}

      {stage === 'generated' &&
        ghostRemovedAnchors.map((waypoint) => (
          <group
            key={`density-ghost-${waypoint.id}`}
            position={toAltitudeMarkerPosition(waypoint, waypoint.z)}
          >
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}>
              <ringGeometry args={[2.9, 3.65, 36]} />
              <meshBasicMaterial color="#94a3b8" transparent opacity={0.4} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.18, 0]}>
              <ringGeometry args={[1.85, 2.35, 36]} />
              <meshBasicMaterial color="#cbd5e1" transparent opacity={0.52} />
            </mesh>
            <Billboard position={[0, 8.6, 0]} follow>
              <mesh>
                <circleGeometry args={[3.6, 36]} />
                <meshBasicMaterial color="#94a3b8" transparent opacity={0.46} />
              </mesh>
              <Text
                position={[0, 0, 0.05]}
                fontSize={2.8}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
              >
                {waypoint.id}
              </Text>
            </Billboard>
          </group>
        ))}

      {(stage === 'drawing' || stage === 'editing') &&
        drawingPoints.map((point, index) => (
          <group
            key={point.id}
            position={toAltitudeMarkerPosition(point, scanAltitude)}
            scale={
              index === 0 && canClosePolygon && isReadyToClose
                ? [1.18, 1.18, 1.18]
                : [1, 1, 1]
            }
            onPointerDown={(event) => handleVertexPointerDown(event, point.id)}
            onClick={(event) => handleVertexClick(event, index)}
          >
            {index === 0 && canClosePolygon && (
              <CloseLoopRing active={isReadyToClose} />
            )}

            <mesh>
              <sphereGeometry
                args={[draggingPointId === point.id ? 2.65 : 2.35, 28, 28]}
              />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <sphereGeometry args={[1.3, 22, 22]} />
              <meshStandardMaterial
                color={drawingTarget === 'exclusion' ? '#f97316' : '#7c6bff'}
                emissive={drawingTarget === 'exclusion' ? '#f97316' : '#7c6bff'}
                emissiveIntensity={0.18}
              />
            </mesh>

            <Billboard position={[0, 9, 0]} follow>
              <mesh>
                <circleGeometry args={[4.2, 36]} />
                <meshBasicMaterial
                  color={drawingTarget === 'exclusion' ? '#f97316' : '#7c6bff'}
                />
              </mesh>
              <Text
                position={[0, 0, 0.05]}
                fontSize={3.25}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
              >
                {point.id}
              </Text>
            </Billboard>
          </group>
        ))}

      {hoverPoint && isPlaneInteractive && !isReadyToClose && (
        <>
          <Line
            points={[
              [hoverPoint.x - 3.5, scanAltitude + HOVER_OFFSET, hoverPoint.y],
              [hoverPoint.x + 3.5, scanAltitude + HOVER_OFFSET, hoverPoint.y],
            ]}
            color={drawingTarget === 'exclusion' ? '#f97316' : '#7c6bff'}
          />
          <Line
            points={[
              [hoverPoint.x, scanAltitude + HOVER_OFFSET, hoverPoint.y - 3.5],
              [hoverPoint.x, scanAltitude + HOVER_OFFSET, hoverPoint.y + 3.5],
            ]}
            color={drawingTarget === 'exclusion' ? '#f97316' : '#7c6bff'}
          />
          <mesh position={[hoverPoint.x, scanAltitude + HOVER_OFFSET, hoverPoint.y]}>
            <sphereGeometry args={[0.9, 20, 20]} />
            <meshBasicMaterial
              color={drawingTarget === 'exclusion' ? '#f97316' : '#7c6bff'}
              transparent
              opacity={0.7}
            />
          </mesh>
        </>
      )}

      {stage === 'generated' &&
        revealedWaypoints.map((waypoint) => {
          const isSelected = waypoint.id === selectedWaypointId
          const isHovered = waypoint.id === hoveredWaypointId
          const isIntermediate = waypoint.role === 'intermediate'
          const isSphereHovered = hoveredWaypointSphereId === waypoint.id
          const isXYDragging = draggingWaypointXY?.waypointId === waypoint.id
          const isSphereEditableHover = isSelected && isSphereHovered
          const actionIcons = waypoint.actions
            .slice(0, 3)
            .map((action) => getWaypointActionViewportIcon(action.type))
          const isStartWaypoint = waypoint.id === startWaypointId
          const isEndWaypoint = waypoint.id === endWaypointId
          const isPointOfNoReturn = waypoint.id === pointOfNoReturnId
          const outerRadius = isIntermediate
            ? isSelected
              ? 2.15
              : 1.85
            : isSelected
              ? 2.7
              : 2.3
          const innerRadius = isIntermediate
            ? isSelected
              ? 1.18
              : 1.02
            : isSelected
              ? 1.6
              : 1.4

          return (
            <group
              key={waypoint.id}
              position={toAltitudeMarkerPosition(waypoint, waypoint.z)}
              onPointerEnter={() => {
                onHoveredWaypointChange?.(waypoint.id)
              }}
              onPointerLeave={() => {
                onHoveredWaypointChange?.(null)
              }}
              onClick={(event) => {
                event.stopPropagation()

                if (inputLocked) {
                  return
                }

                if (isWaypointDragActive) {
                  return
                }

                if (bulkAssignActionType) {
                  onBulkAssignWaypoint?.(waypoint.id)
                  return
                }

                onSelectWaypoint(waypoint.id)
              }}
              onContextMenu={(event) => {
                event.stopPropagation()
                event.nativeEvent.preventDefault()

                if (inputLocked) {
                  return
                }

                if (bulkAssignActionType) {
                  onExitBulkAssign?.()
                  return
                }

                onWaypointContextMenu?.({
                  waypointId: waypoint.id,
                  clientX: event.clientX,
                  clientY: event.clientY,
                })
              }}
              >
              {isStartWaypoint && (
                <mesh rotation-x={-Math.PI / 2} position={[0, 0.3, 0]}>
                  <ringGeometry args={[3.2, 3.9, 36]} />
                  <meshBasicMaterial color="#10b981" transparent opacity={0.92} />
                </mesh>
              )}

              {isHovered && !isSelected && (
                <mesh rotation-x={-Math.PI / 2} position={[0, 0.24, 0]}>
                  <ringGeometry
                    args={isIntermediate ? [2.8, 3.45, 36] : [3.6, 4.4, 36]}
                  />
                  <meshBasicMaterial
                    color={selectedPatternColor}
                    transparent
                    opacity={isIntermediate ? 0.22 : 0.32}
                  />
                </mesh>
              )}

              {isPointOfNoReturn && (
                <>
                  <mesh rotation-x={-Math.PI / 2} position={[0, 0.18, 0]}>
                    <ringGeometry args={[4.2, 5.3, 40]} />
                    <meshBasicMaterial color="#f97316" transparent opacity={0.66} />
                  </mesh>
                  <Billboard position={[0, 18, 0]} follow>
                    <mesh>
                      <planeGeometry args={[10.8, 4]} />
                      <meshBasicMaterial color="#f97316" transparent opacity={0.96} />
                    </mesh>
                    <Text
                      position={[0, 0, 0.05]}
                      fontSize={1.95}
                      color="#ffffff"
                      anchorX="center"
                      anchorY="middle"
                    >
                      PNR
                    </Text>
                  </Billboard>
                </>
              )}

              <mesh
                onPointerEnter={(event) => {
                  event.stopPropagation()
                  setHoveredWaypointSphereId(waypoint.id)
                }}
                onPointerLeave={(event) => {
                  event.stopPropagation()

                  if (draggingWaypointXY?.waypointId !== waypoint.id) {
                    setHoveredWaypointSphereId((current) =>
                      current === waypoint.id ? null : current,
                    )
                  }
                }}
                onPointerDown={(event) =>
                  handleGeneratedWaypointSpherePointerDown(event, waypoint)
                }
              >
                <sphereGeometry
                  args={[
                    outerRadius +
                      (isSphereEditableHover || isXYDragging
                        ? isIntermediate
                          ? 0.18
                          : 0.25
                        : 0),
                    28,
                    28,
                  ]}
                />
                <meshStandardMaterial
                  color="#ffffff"
                  transparent
                  opacity={isIntermediate ? 0.82 : 1}
                />
              </mesh>
              <mesh position={[0, 0.12, 0]}>
                <sphereGeometry args={[innerRadius, 22, 22]} />
                <meshStandardMaterial
                  color={selectedPatternColor}
                  emissive={selectedPatternColor}
                  emissiveIntensity={
                    isXYDragging
                      ? 0.38
                      : isSelected
                        ? 0.32
                        : isHovered || isSphereHovered
                          ? 0.3
                          : 0.22
                  }
                  transparent
                  opacity={isIntermediate ? 0.84 : 1}
                />
              </mesh>

              {activeWaypointTooltip?.waypoint.id === waypoint.id && (
                <Html position={[0, 12.5, 0]} center style={{ transform: 'translate(18px, -18px)' }}>
                  <div
                    className={`waypoint-drag-tooltip ${
                      activeWaypointTooltip.mode === 'z'
                        ? 'is-altitude'
                        : activeWaypointTooltip.mode === 'xy'
                          ? 'is-xy'
                          : 'is-selected'
                    } ${
                      activeWaypointTooltip.clampState === 'none'
                        ? ''
                        : 'is-clamped'
                    }`}
                  >
                    <div className="waypoint-drag-tooltip__title">
                      {activeWaypointTooltip.title}
                    </div>
                    {activeWaypointTooltip.lines.map((line) => (
                      <div
                        key={`${waypoint.id}-${line.label}`}
                        className={`waypoint-drag-tooltip__row ${
                          line.active ? 'is-active-axis' : ''
                        }`}
                      >
                        <span>{line.label}</span>
                        <strong>{line.value}</strong>
                        <em
                          className={
                            line.delta
                              ? line.delta.startsWith('-')
                                ? 'is-negative'
                                : 'is-positive'
                              : ''
                          }
                        >
                          {line.delta ?? ''}
                        </em>
                      </div>
                    ))}
                    {activeWaypointTooltip.snapActive && (
                      <div className="waypoint-drag-tooltip__hint">snap 5m</div>
                    )}
                    {activeWaypointTooltip.clampState !== 'none' && (
                      <div className="waypoint-drag-tooltip__hint is-danger">
                        {activeWaypointTooltip.clampState === 'min'
                          ? 'min altitude reached'
                          : 'max altitude reached'}
                      </div>
                    )}
                  </div>
                </Html>
              )}

              {isStartWaypoint && (
                <Billboard position={[0, 14.2, 0]} follow>
                  <mesh>
                    <planeGeometry args={[14, 4.3]} />
                    <meshBasicMaterial color="#10b981" transparent opacity={0.98} />
                  </mesh>
                  <Text
                    position={[0, 0, 0.05]}
                    fontSize={2.1}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="middle"
                  >
                    START
                  </Text>
                </Billboard>
              )}

              {isEndWaypoint && (
                <Billboard position={[0, 14.2, 0]} follow>
                  <mesh>
                    <planeGeometry args={[11.2, 4.1]} />
                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.96} />
                  </mesh>
                  <Text
                    position={[0, 0, 0.05]}
                    fontSize={2.1}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="middle"
                  >
                    END
                  </Text>
                </Billboard>
              )}

              {actionIcons.length > 0 && (
                <Html
                  position={[isIntermediate ? 4.3 : 5.4, isIntermediate ? 4.3 : 4.8, 0]}
                  center
                  transform={false}
                  style={{ pointerEvents: 'none' }}
                >
                  <div className="waypoint-action-icon-row" aria-hidden="true">
                    {actionIcons.map((Icon, index) => (
                      <span
                        key={`${waypoint.id}-action-icon-${index}`}
                        className="waypoint-action-icon-chip"
                      >
                        <Icon size={isIntermediate ? 11 : 12} strokeWidth={2.2} />
                      </span>
                    ))}
                  </div>
                </Html>
              )}
            </group>
          )
        })}

      <AltitudeBeacon
        anchor={flightAnchor}
        isMissionGenerated={stage === 'generated'}
        isWaypointSelected={selectedWaypoint !== null}
      />
    </>
  )
}

function ExclusionZoneMesh({
  zone,
  altitude,
  isActive,
  onSelect,
}: {
  zone: ExclusionZone
  altitude: number
  isActive: boolean
  onSelect?: ((id: number | null) => void) | undefined
}) {
  const shape = useMemo(
    () => (zone.points.length >= 3 ? buildPolygonShape(zone.points) : null),
    [zone.points],
  )
  const outlinePoints = useMemo(
    () =>
      zone.points.length >= 3
        ? [
            ...zone.points.map((point) =>
              toAltitudePlanePosition(point, altitude, ALTITUDE_LINE_OFFSET + 0.12),
            ),
            toAltitudePlanePosition(
              zone.points[0],
              altitude,
              ALTITUDE_LINE_OFFSET + 0.12,
            ),
          ]
        : [],
    [altitude, zone.points],
  )
  const centroid = useMemo(
    () => (zone.points.length >= 3 ? polygonCentroid(zone.points) : null),
    [zone.points],
  )
  const fillOpacity = zone.enabled
    ? isActive
      ? 0.22
      : 0.14
    : 0.05
  const lineOpacity = zone.enabled
    ? isActive
      ? 0.9
      : 0.72
    : 0.34
  const labelColor = zone.enabled ? '#f97316' : '#94a3b8'

  if (!shape || outlinePoints.length < 2 || !centroid) {
    return null
  }

  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, altitude + ALTITUDE_PLANE_FILL_OFFSET * 1.2, 0]}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(zone.id)
        }}
      >
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color={zone.enabled ? '#f97316' : '#94a3b8'}
          transparent
          opacity={fillOpacity}
        />
      </mesh>
      <Line
        points={outlinePoints}
        color={zone.enabled ? '#ea580c' : '#94a3b8'}
        transparent
        opacity={lineOpacity}
        dashed
        dashSize={4}
        gapSize={3}
        lineWidth={isActive ? 2.4 : 1.8}
      />
      <Billboard
        position={[
          centroid.x,
          altitude + ALTITUDE_MARKER_LIFT * 1.55,
          centroid.y,
        ]}
        follow
      >
        <mesh>
          <planeGeometry args={[Math.max(18, zone.label.length * 1.5), 4.2]} />
          <meshBasicMaterial
            color={zone.enabled ? '#fff7ed' : '#f8fafc'}
            transparent
            opacity={0.94}
          />
        </mesh>
        <Text
          position={[0, 0, 0.05]}
          fontSize={1.9}
          color={labelColor}
          anchorX="center"
          anchorY="middle"
        >
          {zone.label}
        </Text>
      </Billboard>
    </>
  )
}

function DrawingCameraController({
  stage,
  scanAltitude,
  points,
  cameraTarget,
  draggingPointId,
  waypointContextMenuVisible,
  animationLocked,
  orbitControlsRef,
}: {
  stage: MissionStage
  scanAltitude: number
  points: MissionPoint[]
  cameraTarget: Vec2
  draggingPointId: number | null
  waypointContextMenuVisible: boolean
  animationLocked: boolean
  orbitControlsRef: React.RefObject<OrbitControlsHandle | null>
}) {
  const { camera, size } = useThree()
  const desiredTarget = useMemo(
    () =>
      new THREE.Vector3(
        cameraTarget.x,
        stage === 'idle' ? 0 : scanAltitude,
        cameraTarget.y,
      ),
    [cameraTarget, scanAltitude, stage],
  )
  const viewportAspect = useMemo(
    () => Math.max(size.width, 1) / Math.max(size.height, 1),
    [size.height, size.width],
  )
  const desiredDrawingDistance = useMemo(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || stage !== 'drawing') {
      return 0
    }

    return getDrawingFitDistance(points, camera.fov, viewportAspect, scanAltitude)
  }, [camera, points, scanAltitude, stage, viewportAspect])

  useEffect(() => {
    const controls = orbitControlsRef.current

    if (!controls) {
      return
    }

    controls.enabled =
      draggingPointId === null &&
      !waypointContextMenuVisible &&
      !animationLocked
    controls.enablePan =
      stage !== 'drawing' &&
      !waypointContextMenuVisible &&
      !animationLocked
    controls.enableRotate = true
    controls.enableZoom = true
    controls.minPolarAngle = DEFAULT_MIN_POLAR_ANGLE
    controls.maxPolarAngle =
      stage === 'drawing' ? DRAWING_MAX_POLAR_ANGLE : DEFAULT_MAX_POLAR_ANGLE
    controls.update()
  }, [
    animationLocked,
    draggingPointId,
    orbitControlsRef,
    stage,
    waypointContextMenuVisible,
  ])

  useFrame((_, delta) => {
    const controls = orbitControlsRef.current

    if (!controls || !(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    if (
      waypointContextMenuVisible ||
      draggingPointId !== null ||
      animationLocked
    ) {
      return
    }

    if (stage !== 'drawing' && stage !== 'setup' && stage !== 'editing') {
      return
    }

    const nextOffset = camera.position.clone().sub(controls.target)

    if (nextOffset.lengthSq() === 0) {
      nextOffset.set(...CAMERA_POSITION).sub(desiredTarget)
    }

    const targetAlpha = 1 - Math.exp(-delta * DRAWING_TARGET_LERP_SPEED)
    controls.target.lerp(desiredTarget, targetAlpha)

    if (stage === 'drawing') {
      const currentDistance = nextOffset.length()

      if (desiredDrawingDistance > currentDistance + 0.5) {
        nextOffset.setLength(
          THREE.MathUtils.damp(
            currentDistance,
            desiredDrawingDistance,
            DRAWING_DISTANCE_DAMP_SPEED,
            delta,
          ),
        )
      }
    }

    camera.position.copy(controls.target.clone().add(nextOffset))
    controls.update()
  })

  return null
}

function GeneratedCameraController({
  stage,
  scanAltitude,
  points,
  waypoints,
  selectedWaypointId,
  skipAnimationToken,
  orbitControlsRef,
  onRevealActiveChange,
}: {
  stage: MissionStage
  scanAltitude: number
  points: MissionPoint[]
  waypoints: MissionWaypoint[]
  selectedWaypointId: number | null
  skipAnimationToken: number
  orbitControlsRef: React.RefObject<OrbitControlsHandle | null>
  onRevealActiveChange: (active: boolean) => void
}) {
  const { camera } = useThree()
  const previousStageRef = useRef<MissionStage>(stage)
  const previousSelectedWaypointIdRef = useRef<number | null>(selectedWaypointId)
  const previousSkipTokenRef = useRef(skipAnimationToken)
  const revealAnimationRef = useRef<CameraAnimation | null>(null)
  const recenterAnimationRef = useRef<CameraAnimation | null>(null)
  const revealLockedRef = useRef(false)
  const missionCenter = useMemo(() => {
    if (points.length > 0) {
      return polygonCentroid(points)
    }

    if (waypoints.length > 0) {
      return polygonCentroid(waypoints)
    }

    return WORLD_CENTER
  }, [points, waypoints])
  const selectedWaypoint = useMemo(
    () =>
      selectedWaypointId === null
        ? null
        : waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null,
    [selectedWaypointId, waypoints],
  )

  useEffect(() => {
    if (skipAnimationToken === previousSkipTokenRef.current) {
      return
    }

    previousSkipTokenRef.current = skipAnimationToken

    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    const controls = orbitControlsRef.current

    if (!controls) {
      return
    }

    if (revealAnimationRef.current) {
      camera.position.copy(revealAnimationRef.current.toPosition)
      controls.target.copy(revealAnimationRef.current.toTarget)
      controls.update()
      revealAnimationRef.current = null
    }

    if (recenterAnimationRef.current) {
      camera.position.copy(recenterAnimationRef.current.toPosition)
      controls.target.copy(recenterAnimationRef.current.toTarget)
      controls.update()
      recenterAnimationRef.current = null
    }

    if (revealLockedRef.current) {
      revealLockedRef.current = false
      onRevealActiveChange(false)
    }
  }, [camera, onRevealActiveChange, orbitControlsRef, skipAnimationToken])

  useEffect(() => {
    if (stage === 'generated') {
      return
    }

    revealAnimationRef.current = null
    recenterAnimationRef.current = null
    previousSelectedWaypointIdRef.current = selectedWaypointId

    if (revealLockedRef.current) {
      revealLockedRef.current = false
      onRevealActiveChange(false)
    }
  }, [onRevealActiveChange, selectedWaypointId, stage])

  useEffect(() => {
    const previousStage = previousStageRef.current
    previousStageRef.current = stage

    if (stage !== 'generated' || previousStage === 'generated') {
      return
    }

    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    const controls = orbitControlsRef.current

    if (!controls) {
      return
    }

    const fitFrame = getMissionFitFrame({
      camera,
      controls,
      points,
      waypoints,
      altitude: scanAltitude,
    })

    if (!fitFrame) {
      return
    }

    revealAnimationRef.current = {
      elapsed: 0,
      duration: GENERATED_REVEAL_DURATION,
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition: fitFrame.position,
      toTarget: fitFrame.target,
    }
    recenterAnimationRef.current = null
    previousSelectedWaypointIdRef.current = null

    if (!revealLockedRef.current) {
      revealLockedRef.current = true
      onRevealActiveChange(true)
    }
  }, [camera, onRevealActiveChange, orbitControlsRef, points, scanAltitude, stage, waypoints])

  useEffect(() => {
    if (stage !== 'generated') {
      return
    }

    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    if (revealAnimationRef.current) {
      return
    }

    if (previousSelectedWaypointIdRef.current === selectedWaypointId) {
      return
    }

    const controls = orbitControlsRef.current

    if (!controls) {
      return
    }

    previousSelectedWaypointIdRef.current = selectedWaypointId

    const desiredTarget = getGeneratedFocusTarget({
      missionCenter,
      selectedWaypoint,
      altitude: scanAltitude,
    })
    const currentOffset = camera.position.clone().sub(controls.target)

    if (currentOffset.lengthSq() === 0) {
      currentOffset.set(...CAMERA_POSITION).sub(desiredTarget)
    }

    recenterAnimationRef.current = {
      elapsed: 0,
      duration: GENERATED_RECENTER_DURATION,
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition: desiredTarget.clone().add(currentOffset),
      toTarget: desiredTarget,
    }
  }, [
    camera,
    missionCenter,
    onRevealActiveChange,
    orbitControlsRef,
    scanAltitude,
    selectedWaypoint,
    selectedWaypointId,
    stage,
  ])

  useFrame((_, delta) => {
    const controls = orbitControlsRef.current

    if (!controls || !(camera instanceof THREE.PerspectiveCamera) || stage !== 'generated') {
      return
    }

    if (revealAnimationRef.current) {
      const isDone = advanceCameraAnimation({
        animation: revealAnimationRef.current,
        camera,
        controls,
        delta,
      })

      if (isDone) {
        revealAnimationRef.current = null

        if (revealLockedRef.current) {
          revealLockedRef.current = false
          onRevealActiveChange(false)
        }
      }

      return
    }

    if (recenterAnimationRef.current) {
      const isDone = advanceCameraAnimation({
        animation: recenterAnimationRef.current,
        camera,
        controls,
        delta,
      })

      if (isDone) {
        recenterAnimationRef.current = null
      }
    }
  })

  return null
}

function AltitudeBeacon({
  anchor,
  isMissionGenerated,
  isWaypointSelected,
}: {
  anchor: { x: number; y: number; z: number }
  isMissionGenerated: boolean
  isWaypointSelected: boolean
}) {
  const beaconColor = isWaypointSelected ? '#5b21f0' : '#f97316'
  const dronePosition = toDronePosition(anchor, anchor.z)

  return (
    <>
      <Line
        points={[toGroundSurfacePosition(anchor), dronePosition]}
        color={beaconColor}
        transparent
        opacity={isMissionGenerated ? 0.82 : 0.7}
        dashed={!isMissionGenerated}
        dashSize={3}
        gapSize={3}
      />

      <group position={dronePosition}>
        <mesh>
          <boxGeometry args={[6.4, 1.5, 6.4]} />
          <meshStandardMaterial color="#243244" />
        </mesh>
        <mesh rotation-y={Math.PI / 4}>
          <boxGeometry args={[12.4, 0.44, 0.8]} />
          <meshStandardMaterial color="#38465a" />
        </mesh>
        <mesh rotation-y={-Math.PI / 4}>
          <boxGeometry args={[12.4, 0.44, 0.8]} />
          <meshStandardMaterial color="#38465a" />
        </mesh>
      </group>
    </>
  )
}

function DroneSimulationLayer({
  session,
  command,
  speed,
  followCamera,
  altitude,
  color,
  inputLocked,
  orbitControlsRef,
  lastOrbitInteractionAtRef,
  onTelemetryChange,
}: {
  session: DroneSimulationSession | null
  command: DroneSimulationCommand | null
  speed: number
  followCamera: boolean
  altitude: number
  color: string
  inputLocked: boolean
  orbitControlsRef: React.RefObject<OrbitControlsHandle | null>
  lastOrbitInteractionAtRef: React.RefObject<number>
  onTelemetryChange?: (telemetry: DroneSimulationTelemetry) => void
}) {
  const { camera } = useThree()
  const simulationCameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const simulationPath = useMemo(
    () =>
      session
        ? buildDroneSimulationPath({
            waypoints: session.waypoints,
            isClosedLoop: session.isClosedLoop,
          })
        : null,
    [session],
  )
  const [renderState, setRenderState] = useState<{
    position: ScenePoint
    heading: ScenePoint
    travelled: ScenePoint[]
    remaining: ScenePoint[]
    currentWaypointIndex: number
    progress: number
    currentCue: string | null
    statusLabel: string | null
    pulseWaypointId: number | null
    trailPoints: ScenePoint[]
  } | null>(null)
  const previousSessionKeyRef = useRef<number | null>(null)
  const previousCommandTokenRef = useRef<number | null>(null)
  const progressRef = useRef(0)
  const isPlayingRef = useRef(false)
  const isCompletedRef = useRef(false)
  const pauseRemainingMsRef = useRef(0)
  const loopRestartRemainingMsRef = useRef(0)
  const lastVisitedWaypointIndexRef = useRef(0)
  const activeCueRemainingMsRef = useRef(0)
  const activeCueRef = useRef<string | null>(null)
  const trailPointsRef = useRef<ScenePoint[]>([])
  const telemetryLastPublishedAtRef = useRef(0)
  const currentPulseWaypointIdRef = useRef<number | null>(null)
  const gridPassPauseAppliedRef = useRef(false)
  const previewOrbitStartedAtRef = useRef<number | null>(null)
  const simulationCameraProfile = useMemo(
    () =>
      getSimulationCameraProfile(
        simulationPath?.totalLength ?? 0,
        session?.patternId ?? 'coverage',
        session?.source ?? 'generated',
      ),
    [session?.patternId, session?.source, simulationPath?.totalLength],
  )
  const simulationMissionCenter = useMemo(() => {
    if (!session || session.waypoints.length === 0) {
      return null
    }

    const center = polygonCentroid(session.waypoints)
    const averageAltitude =
      session.waypoints.reduce((sum, waypoint) => sum + waypoint.z, 0) /
      session.waypoints.length

    return new THREE.Vector3(center.x, averageAltitude, center.y)
  }, [session])

  const publishTelemetry = useCallback(
    (
      partial?: Partial<DroneSimulationTelemetry>,
      force = false,
    ) => {
      if (!onTelemetryChange) {
        return
      }

      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now()

      if (!force && now - telemetryLastPublishedAtRef.current < 80) {
        return
      }

      telemetryLastPublishedAtRef.current = now
      onTelemetryChange({
        ...DEFAULT_DRONE_SIMULATION_TELEMETRY,
        visible: Boolean(session && simulationPath),
        mode: session?.mode ?? null,
        source: session?.source ?? null,
        patternId: session?.patternId ?? null,
        isPlaying: isPlayingRef.current,
        isCompleted: isCompletedRef.current,
        progress: progressRef.current,
        currentWaypointIndex:
          partial?.currentWaypointIndex ?? lastVisitedWaypointIndexRef.current,
        waypointCount: simulationPath?.waypoints.length ?? 0,
        ...partial,
      })
    },
    [onTelemetryChange, session, simulationPath],
  )

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      simulationCameraRef.current = camera
    }
  }, [camera])

  useEffect(() => {
    const simulationCamera = simulationCameraRef.current

    if (!simulationCamera || !session) {
      return
    }

    const previousFov = simulationCamera.fov
    simulationCamera.fov = simulationCameraProfile.desiredFov
    simulationCamera.updateProjectionMatrix()

    return () => {
      simulationCamera.fov = previousFov
      simulationCamera.updateProjectionMatrix()
    }
  }, [session, simulationCameraProfile.desiredFov])

  useEffect(() => {
    const controls = orbitControlsRef.current

    if (!controls) {
      return
    }

    if (session && followCamera) {
      controls.minDistance = simulationCameraProfile.minDistance * 0.88
      controls.maxDistance = simulationCameraProfile.maxDistance * 1.05
      controls.minPolarAngle = Math.max(
        DEFAULT_MIN_POLAR_ANGLE,
        simulationCameraProfile.minPolarAngle,
      )
      controls.maxPolarAngle = Math.min(
        DEFAULT_MAX_POLAR_ANGLE,
        simulationCameraProfile.maxPolarAngle,
      )
      controls.update()

      return () => {
        controls.minDistance = MIN_CAMERA_DISTANCE
        controls.maxDistance = MAX_CAMERA_DISTANCE
        controls.minPolarAngle = DEFAULT_MIN_POLAR_ANGLE
        controls.maxPolarAngle = DEFAULT_MAX_POLAR_ANGLE
        controls.update()
      }
    }

    controls.minDistance = MIN_CAMERA_DISTANCE
    controls.maxDistance = MAX_CAMERA_DISTANCE
    controls.minPolarAngle = DEFAULT_MIN_POLAR_ANGLE
    controls.maxPolarAngle = DEFAULT_MAX_POLAR_ANGLE
    controls.update()
  }, [followCamera, orbitControlsRef, session, simulationCameraProfile])

  useEffect(() => {
    if (!session || !simulationPath) {
      previousSessionKeyRef.current = null
      previousCommandTokenRef.current = null
      progressRef.current = 0
      isPlayingRef.current = false
      isCompletedRef.current = false
      pauseRemainingMsRef.current = 0
      loopRestartRemainingMsRef.current = 0
      lastVisitedWaypointIndexRef.current = 0
      activeCueRemainingMsRef.current = 0
      activeCueRef.current = null
      trailPointsRef.current = []
      currentPulseWaypointIdRef.current = null
      gridPassPauseAppliedRef.current = false
      previewOrbitStartedAtRef.current = null
      const frameId = window.requestAnimationFrame(() => {
        setRenderState(null)
      })
      onTelemetryChange?.(DEFAULT_DRONE_SIMULATION_TELEMETRY)
      return () => {
        window.cancelAnimationFrame(frameId)
      }
    }

    if (previousSessionKeyRef.current === session.key) {
      return
    }

    previousSessionKeyRef.current = session.key
    progressRef.current = 0
    isPlayingRef.current = true
    isCompletedRef.current = false
    pauseRemainingMsRef.current = 0
    loopRestartRemainingMsRef.current = 0
    lastVisitedWaypointIndexRef.current = 0
    activeCueRemainingMsRef.current = 0
    activeCueRef.current = null
    gridPassPauseAppliedRef.current = false
    previewOrbitStartedAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    currentPulseWaypointIdRef.current = simulationPath.waypoints[0]?.id ?? null
    const initialSample = sampleDroneSimulationPath(simulationPath, 0)
    const initialSplit = getDroneSimulationPathSplit(simulationPath, 0)
    const initialScenePoint = toScenePositionFromVec3(initialSample.position)
    trailPointsRef.current = [initialScenePoint]
    const frameId = window.requestAnimationFrame(() => {
      setRenderState({
        position: initialScenePoint,
        heading: toHeadingScenePoint(initialSample.heading),
        travelled: initialSplit.travelled.map(toScenePositionFromVec3),
        remaining: initialSplit.remaining.map(toScenePositionFromVec3),
        currentWaypointIndex: 0,
        progress: 0,
        currentCue: null,
        statusLabel: getSimulationStatusLabel({
          patternId: session.patternId,
          currentWaypointIndex: 0,
          waypointCount: simulationPath.waypoints.length,
        }),
        pulseWaypointId: simulationPath.waypoints[0]?.id ?? null,
        trailPoints: [initialScenePoint],
      })
    })
    publishTelemetry(
      {
        isPlaying: true,
        isCompleted: false,
        progress: 0,
        currentWaypointIndex: 0,
        waypointCount: simulationPath.waypoints.length,
      },
      true,
    )
    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [onTelemetryChange, publishTelemetry, session, simulationPath])

  useEffect(() => {
    if (!command || !session || !simulationPath) {
      return
    }

    if (previousCommandTokenRef.current === command.token) {
      return
    }

    previousCommandTokenRef.current = command.token

    switch (command.type) {
      case 'toggle-play':
        isPlayingRef.current = !isPlayingRef.current
        break
      case 'play':
        isPlayingRef.current = true
        break
      case 'pause':
        isPlayingRef.current = false
        break
      case 'stop':
        isPlayingRef.current = false
        break
      case 'replay':
        progressRef.current = 0
        isPlayingRef.current = true
        isCompletedRef.current = false
        break
      case 'seek-progress':
        progressRef.current = Math.min(1, Math.max(0, command.progress))
        isCompletedRef.current = false
        break
      case 'seek-waypoint': {
        const currentIndex = getDroneSimulationWaypointIndexAtProgress(
          simulationPath,
          progressRef.current,
        )
        const nextIndex =
          command.direction === 'next'
            ? Math.min(currentIndex + 1, simulationPath.waypoints.length - 1)
            : Math.max(currentIndex - 1, 0)
        progressRef.current = getDroneSimulationWaypointProgress(
          simulationPath,
          nextIndex,
        )
        isCompletedRef.current = false
        break
      }
    }

    publishTelemetry(
      {
        isPlaying: isPlayingRef.current,
        isCompleted: isCompletedRef.current,
        progress: progressRef.current,
        currentWaypointIndex: getDroneSimulationWaypointIndexAtProgress(
          simulationPath,
          progressRef.current,
        ),
        waypointCount: simulationPath.waypoints.length,
      },
      true,
    )
  }, [command, publishTelemetry, session, simulationPath])

  useFrame((_, delta) => {
    if (!session || !simulationPath || !renderState) {
      return
    }

    if (!inputLocked && isPlayingRef.current) {
      if (pauseRemainingMsRef.current > 0) {
        pauseRemainingMsRef.current = Math.max(
          0,
          pauseRemainingMsRef.current - delta * 1000,
        )
      } else if (loopRestartRemainingMsRef.current > 0) {
        loopRestartRemainingMsRef.current = Math.max(
          0,
          loopRestartRemainingMsRef.current - delta * 1000,
        )

        if (loopRestartRemainingMsRef.current === 0) {
          progressRef.current = 0
          isCompletedRef.current = false
          lastVisitedWaypointIndexRef.current = 0
          trailPointsRef.current = trailPointsRef.current.slice(0, 1)
        }
      } else {
        const durationMs =
          getDroneSimulationDurationMs(
            simulationPath.totalLength,
            session.mode,
            session.source,
          ) /
          Math.max(speed, 0.25)
        const patternSpeedFactor =
          session.patternId === 'spiral'
            ? Math.max(0.72, 1 - progressRef.current * 0.34)
            : 1
        const deltaProgress =
          ((delta * 1000) / Math.max(durationMs, 1)) * patternSpeedFactor
        let nextProgress = progressRef.current + deltaProgress

        if (session.mode === 'loop') {
          if (nextProgress >= 1) {
            nextProgress = 1
            isCompletedRef.current = true
            loopRestartRemainingMsRef.current = DRONE_SIMULATION_RESTART_DELAY_MS
          }
        } else if (nextProgress >= 1) {
          nextProgress = 1
          isPlayingRef.current = false
          isCompletedRef.current = true
        }

        progressRef.current = nextProgress
      }
    }

    if (activeCueRemainingMsRef.current > 0) {
      activeCueRemainingMsRef.current = Math.max(
        0,
        activeCueRemainingMsRef.current - delta * 1000,
      )

      if (activeCueRemainingMsRef.current === 0) {
        activeCueRef.current = null
      }
    }

    const currentWaypointIndex = getDroneSimulationWaypointIndexAtProgress(
      simulationPath,
      progressRef.current,
    )

    if (currentWaypointIndex !== lastVisitedWaypointIndexRef.current) {
      const reachedWaypoint = simulationPath.waypoints[currentWaypointIndex]

      if (reachedWaypoint) {
        pauseRemainingMsRef.current = Math.max(
          pauseRemainingMsRef.current,
          reachedWaypoint.pauseMs,
        )
        const cues = getWaypointSimulationActionCues(reachedWaypoint)
        if (cues.length > 0) {
          activeCueRef.current = cues[0].type
          activeCueRemainingMsRef.current = Math.max(
            cues[0].durationMs,
            reachedWaypoint.pauseMs,
          )
        }
        currentPulseWaypointIdRef.current = reachedWaypoint.id
      }

      lastVisitedWaypointIndexRef.current = currentWaypointIndex
    }

    if (
      session.patternId === 'grid' &&
      !gridPassPauseAppliedRef.current &&
      currentWaypointIndex >= Math.floor(simulationPath.waypoints.length / 2)
    ) {
      pauseRemainingMsRef.current = Math.max(pauseRemainingMsRef.current, 500)
      activeCueRef.current = 'grid_pass_two'
      activeCueRemainingMsRef.current = 500
      gridPassPauseAppliedRef.current = true
    }

    const sample = sampleDroneSimulationPath(simulationPath, progressRef.current)
    const split = getDroneSimulationPathSplit(simulationPath, progressRef.current)
    const nextScenePoint = toScenePositionFromVec3(sample.position)
    const heading = toHeadingScenePoint(sample.heading)
    const trailLimit =
      simulationPath.waypoints.length > DRONE_SIMULATION_LONG_PATH_WAYPOINT_THRESHOLD
        ? DRONE_SIMULATION_TRAIL_POINT_LIMIT_LONG_PATH
        : DRONE_SIMULATION_TRAIL_POINT_LIMIT
    const previousTrailPoint = trailPointsRef.current[trailPointsRef.current.length - 1]

    if (
      !previousTrailPoint ||
      distanceBetweenScenePoints(previousTrailPoint, nextScenePoint) > 2.4
    ) {
      trailPointsRef.current = [...trailPointsRef.current, nextScenePoint].slice(-trailLimit)
    }

    setRenderState({
      position: nextScenePoint,
      heading,
      travelled: split.travelled.map(toScenePositionFromVec3),
      remaining: split.remaining.map(toScenePositionFromVec3),
      currentWaypointIndex,
      progress: progressRef.current,
      currentCue: activeCueRef.current,
      statusLabel: getSimulationStatusLabel({
        patternId: session.patternId,
        currentWaypointIndex,
        waypointCount: simulationPath.waypoints.length,
      }),
      pulseWaypointId: currentPulseWaypointIdRef.current,
      trailPoints: trailPointsRef.current,
    })

    const controls = orbitControlsRef.current
    const lastOrbitInteractionAt = lastOrbitInteractionAtRef.current
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()

    if (
      followCamera &&
      controls &&
      camera instanceof THREE.PerspectiveCamera &&
      now - lastOrbitInteractionAt > DRONE_SIMULATION_FOLLOW_RESUME_DELAY_MS
    ) {
      const previewOrbitElapsedMs =
        previewOrbitStartedAtRef.current === null
          ? 0
          : now - previewOrbitStartedAtRef.current
      const desiredTarget =
        simulationCameraProfile.fixedTarget && simulationCameraProfile.previewOrbit
          ? simulationCameraProfile.fixedTarget.clone()
          : simulationCameraProfile.fixedTarget?.clone() ??
            getSimulationFollowTarget({
              position: nextScenePoint,
              heading,
              profile: simulationCameraProfile,
              missionCenter: simulationMissionCenter,
            })
      const desiredPosition =
        simulationCameraProfile.fixedPosition &&
        simulationCameraProfile.fixedTarget &&
        simulationCameraProfile.previewOrbit
          ? getPreviewOrbitCameraPosition({
              fixedPosition: simulationCameraProfile.fixedPosition,
              fixedTarget: simulationCameraProfile.fixedTarget,
              elapsedMs: previewOrbitElapsedMs,
              patternId: session.patternId,
              orbit: simulationCameraProfile.previewOrbit,
            })
          : simulationCameraProfile.fixedPosition?.clone() ??
            getSimulationFollowCameraPosition({
              desiredTarget,
              heading,
              currentCameraPosition: camera.position,
              currentTarget: controls.target,
              profile: simulationCameraProfile,
            })
      const offset = camera.position.clone().sub(controls.target)
      const shouldRecoverAggressively = isSimulationCameraOutsideEnvelope(
        offset,
        simulationCameraProfile,
      )
      const targetAlpha =
        1 - Math.exp(-delta * simulationCameraProfile.targetLerpSpeed)
      const positionAlpha =
        1 -
        Math.exp(
          -delta *
            (shouldRecoverAggressively
              ? simulationCameraProfile.recoveryLerpSpeed
              : simulationCameraProfile.positionLerpSpeed),
        )
      controls.target.lerp(desiredTarget, targetAlpha)
      camera.position.lerp(desiredPosition, positionAlpha)
      controls.update()
    }

    publishTelemetry({
      isPlaying: isPlayingRef.current,
      isCompleted: isCompletedRef.current,
      progress: progressRef.current,
      currentWaypointIndex,
      waypointCount: simulationPath.waypoints.length,
    })
  })

  if (!session || !simulationPath || !renderState) {
    return null
  }

  const showShadow =
    simulationPath.waypoints.length <= DRONE_SIMULATION_LONG_PATH_WAYPOINT_THRESHOLD
  const orbitCenter =
    session.patternId === 'orbit'
      ? polygonCentroid(session.waypoints)
      : null

  return (
    <>
      {renderState.travelled.length >= 2 && (
        <Line
          points={renderState.travelled}
          color={color}
          transparent
          opacity={0.92}
          lineWidth={4.2}
        />
      )}

      {renderState.remaining.length >= 2 && (
        <Line
          points={renderState.remaining}
          color={color}
          transparent
          opacity={0.28}
          dashed
          dashSize={4}
          gapSize={3}
          lineWidth={2.6}
        />
      )}

      {orbitCenter && (
        <Line
          points={[
            [orbitCenter.x, altitude + PATTERN_OVERLAY_OFFSET + 0.08, orbitCenter.y],
            renderState.position,
          ]}
          color={color}
          transparent
          opacity={0.4}
          dashed
          dashSize={3}
          gapSize={3}
          lineWidth={1.8}
        />
      )}

      {renderState.pulseWaypointId !== null &&
        session.waypoints
          .filter((waypoint) => waypoint.id === renderState.pulseWaypointId)
          .map((waypoint) => (
            <mesh
              key={`simulation-pulse-${waypoint.id}`}
              rotation-x={-Math.PI / 2}
              position={[waypoint.x, waypoint.z + 0.2, waypoint.y]}
            >
              <ringGeometry args={[3.2, 4.4, 36]} />
              <meshBasicMaterial color={color} transparent opacity={0.28} />
            </mesh>
          ))}

      {renderState.currentCue && (
        <Billboard position={[renderState.position[0], renderState.position[1] + 12, renderState.position[2]]} follow>
          <mesh>
            <planeGeometry args={[18, 5]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.94} />
          </mesh>
          <Text
            position={[0, 0, 0.05]}
            fontSize={1.9}
            color={color}
            anchorX="center"
            anchorY="middle"
          >
            {formatSimulationCueLabel(renderState.currentCue)}
          </Text>
        </Billboard>
      )}

      {renderState.statusLabel && (
        <Billboard position={[renderState.position[0], renderState.position[1] + 18, renderState.position[2]]} follow>
          <mesh>
            <planeGeometry args={[16, 4.4]} />
            <meshBasicMaterial color="#111827" transparent opacity={0.72} />
          </mesh>
          <Text
            position={[0, 0, 0.05]}
            fontSize={1.65}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
          >
            {renderState.statusLabel}
          </Text>
        </Billboard>
      )}

      <DroneGhost
        position={renderState.position}
        heading={renderState.heading}
        color={color}
        trailPoints={renderState.trailPoints}
        visible
        showShadow={showShadow}
        lift={0}
        emphasized={session.mode === 'one-shot'}
      />
    </>
  )
}

function CloseLoopRing({ active }: { active: boolean }) {
  const pulseRef = useRef<THREE.Mesh>(null)
  const pulseMaterialRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    if (!pulseRef.current || !pulseMaterialRef.current) {
      return
    }

    const cycle = active ? (clock.getElapsedTime() * 1.75) % 1 : 0
    const scale = active ? 1.1 + cycle * 0.72 : 1
    const opacity = active ? 0.24 * (1 - cycle) : 0

    pulseRef.current.scale.setScalar(scale)
    pulseMaterialRef.current.opacity = opacity
  })

  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -ALTITUDE_MARKER_LIFT + ALTITUDE_LINE_OFFSET, 0]}
      >
        <ringGeometry args={active ? [5.2, 7.3, 64] : [4.8, 6.8, 64]} />
        <meshBasicMaterial
          color="#7c6bff"
          transparent
          opacity={active ? 0.38 : 0.22}
        />
      </mesh>

      {active && (
        <mesh
          ref={pulseRef}
          rotation-x={-Math.PI / 2}
          position={[0, -ALTITUDE_MARKER_LIFT + ALTITUDE_LINE_OFFSET, 0]}
        >
          <ringGeometry args={[5.1, 7.1, 64]} />
          <meshBasicMaterial
            ref={pulseMaterialRef}
            color="#8b5cf6"
            transparent
            opacity={0.24}
          />
        </mesh>
      )}
    </>
  )
}

function PatternPickerAnchorObserver({
  visible,
  points,
  altitude,
  onAnchorChange,
}: {
  visible: boolean
  points: MissionPoint[]
  altitude: number
  onAnchorChange?: (anchor: Vec2 | null) => void
}) {
  const { camera, gl } = useThree()
  const lastAnchorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!visible) {
      lastAnchorRef.current = null
      onAnchorChange?.(null)
    }
  }, [onAnchorChange, visible])

  useFrame(() => {
    if (!visible || points.length < 3 || !onAnchorChange) {
      return
    }

    const centroid = polygonCentroid(points)
    const nextAnchor = projectScenePointToViewport(
      new THREE.Vector3(...toAltitudePlanePosition(centroid, altitude)),
      camera,
      gl.domElement.getBoundingClientRect(),
    )

    if (!nextAnchor) {
      return
    }

    const roundedAnchor = {
      x: Math.round(nextAnchor.x),
      y: Math.round(nextAnchor.y),
    }
    const signature = `${roundedAnchor.x}:${roundedAnchor.y}`

    if (lastAnchorRef.current === signature) {
      return
    }

    lastAnchorRef.current = signature
    onAnchorChange(roundedAnchor)
  })

  return null
}

function PatternPreviewOverlay({
  pattern,
  points,
  altitude,
}: {
  pattern: FlightPatternId
  points: MissionPoint[]
  altitude: number
}) {
  const color = getFlightPatternOption(pattern).color
  const previewSeries = useMemo(
    () => buildPatternPreviewSeries(pattern, points, altitude),
    [altitude, pattern, points],
  )

  if (previewSeries.length === 0) {
    return null
  }

  return (
    <>
      {previewSeries.map((series, index) => (
        <Line
          key={`${pattern}-${index}`}
          points={series}
          color={color}
          transparent
          opacity={0.84}
          dashed
          dashSize={4}
          gapSize={3}
        />
      ))}
    </>
  )
}

function PatternVisualPolish({
  pattern,
  color,
  points,
  segments,
  waypoints,
  altitude,
  mode,
}: {
  pattern: FlightPatternId
  color: string
  points: MissionPoint[]
  segments: Array<[Vec2, Vec2]>
  waypoints: MissionWaypoint[]
  altitude: number
  mode: 'preview' | 'generated'
}) {
  if (segments.length === 0 && waypoints.length === 0) {
    return null
  }

  switch (pattern) {
    case 'coverage':
      return (
        <CoveragePatternPolish
          color={color}
          points={points}
          segments={segments}
          altitude={altitude}
          mode={mode}
        />
      )
    case 'perimeter':
      return (
        <PerimeterPatternPolish
          color={color}
          segments={segments}
          altitude={altitude}
        />
      )
    case 'orbit':
      return (
        <OrbitPatternPolish
          color={color}
          points={points}
          segments={segments}
          waypoints={waypoints}
          altitude={altitude}
        />
      )
    case 'spiral':
      return (
        <SpiralPatternPolish
          color={color}
          points={points}
          segments={segments}
          waypoints={waypoints}
          altitude={altitude}
        />
      )
    case 'grid':
      return (
        <GridPatternPolish
          color={color}
          segments={segments}
          altitude={altitude}
        />
      )
    case 'corridor':
      return (
        <CorridorPatternPolish
          color={color}
          segments={segments}
          altitude={altitude}
          mode={mode}
        />
      )
  }
}

function CoveragePatternPolish({
  color,
  points,
  segments,
  altitude,
  mode,
}: {
  color: string
  points: MissionPoint[]
  segments: Array<[Vec2, Vec2]>
  altitude: number
  mode: 'preview' | 'generated'
}) {
  const ribbonRef = useRef<THREE.Group>(null)
  const { sweepSegments, connectorSegments, directionAngle, bounds } = useMemo(
    () => getCoverageSegmentGroups(segments, points),
    [points, segments],
  )
  const ribbonTravel = Math.max(Math.min(bounds.height, bounds.width) * 0.28, 12)
  const ribbonLength = Math.max(bounds.width, bounds.height) * 1.2
  const ribbonWidth = Math.max(Math.min(bounds.width, bounds.height) * 0.16, 12)

  useFrame(({ clock }) => {
    if (!ribbonRef.current) {
      return
    }

    const cycle = Math.sin(clock.getElapsedTime() * 0.95)
    const travelX = Math.cos(directionAngle + Math.PI / 2) * cycle * ribbonTravel
    const travelY = Math.sin(directionAngle + Math.PI / 2) * cycle * ribbonTravel
    ribbonRef.current.position.set(
      bounds.center.x + travelX,
      altitude + PATTERN_FILL_OFFSET,
      bounds.center.y + travelY,
    )
  })

  if (segments.length === 0) {
    return null
  }

  return (
    <>
      <group ref={ribbonRef} rotation-y={-directionAngle}>
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[ribbonLength, ribbonWidth]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={mode === 'generated' ? 0.08 : 0.06}
          />
        </mesh>
      </group>

      {sweepSegments.map(([start, end], index) => (
        <Line
          key={`coverage-sweep-${index}`}
          points={[
            toAltitudePlanePosition(start, altitude, PATTERN_OVERLAY_OFFSET),
            toAltitudePlanePosition(end, altitude, PATTERN_OVERLAY_OFFSET),
          ]}
          color={color}
          transparent
          opacity={mode === 'generated' ? 0.18 : 0.14}
          lineWidth={5.2}
        />
      ))}

      {connectorSegments.map(([start, end], index) => (
        <Line
          key={`coverage-connector-${index}`}
          points={[
            toAltitudePlanePosition(start, altitude, PATTERN_OVERLAY_OFFSET + 0.02),
            toAltitudePlanePosition(end, altitude, PATTERN_OVERLAY_OFFSET + 0.02),
          ]}
          color={color}
          transparent
          opacity={0.9}
          lineWidth={3.8}
        />
      ))}
    </>
  )
}

function PerimeterPatternPolish({
  color,
  segments,
  altitude,
}: {
  color: string
  segments: Array<[Vec2, Vec2]>
  altitude: number
}) {
  const orderedPath = useMemo(() => buildOrderedPathFromSegments(segments), [segments])
  const arrowGlyphs = useMemo(() => buildArrowGlyphsForSegments(segments, 4), [segments])

  if (orderedPath.length < 2) {
    return null
  }

  return (
    <>
      <Line
        points={orderedPath.map((point) =>
          toAltitudePlanePosition(point, altitude, PATTERN_OVERLAY_OFFSET),
        )}
        color={color}
        transparent
        opacity={0.22}
        lineWidth={6.4}
      />

      {arrowGlyphs.map((glyph, index) => (
        <group key={`perimeter-arrow-${index}`}>
          <Line
            points={[
              toAltitudePlanePosition(glyph.tip, altitude, PATTERN_OVERLAY_OFFSET + 0.04),
              toAltitudePlanePosition(glyph.left, altitude, PATTERN_OVERLAY_OFFSET + 0.04),
            ]}
            color={color}
            transparent
            opacity={0.82}
            lineWidth={2.6}
          />
          <Line
            points={[
              toAltitudePlanePosition(glyph.tip, altitude, PATTERN_OVERLAY_OFFSET + 0.04),
              toAltitudePlanePosition(glyph.right, altitude, PATTERN_OVERLAY_OFFSET + 0.04),
            ]}
            color={color}
            transparent
            opacity={0.82}
            lineWidth={2.6}
          />
        </group>
      ))}

      <mesh
        rotation-x={-Math.PI / 2}
        position={[orderedPath[0].x, altitude + PATTERN_OVERLAY_OFFSET + 0.03, orderedPath[0].y]}
      >
        <ringGeometry args={[4.8, 6.9, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.42} />
      </mesh>
    </>
  )
}

function OrbitPatternPolish({
  color,
  points,
  segments,
  waypoints,
  altitude,
}: {
  color: string
  points: MissionPoint[]
  segments: Array<[Vec2, Vec2]>
  waypoints: MissionWaypoint[]
  altitude: number
}) {
  const center = useMemo(
    () => getPatternCenter(points, segments, waypoints),
    [points, segments, waypoints],
  )
  const radius = useMemo(
    () => getOrbitRadius(center, points, segments, waypoints),
    [center, points, segments, waypoints],
  )
  const ringRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)
  const radiusSweepRef = useRef<THREE.Group>(null)
  const orbitDotRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    const cycle = (time * 0.8) % 1
    const angle = time * 1.25
    const endpoint = new THREE.Vector3(
      center.x + Math.cos(angle) * radius,
      altitude + PATTERN_OVERLAY_OFFSET + 0.08,
      center.y + Math.sin(angle) * radius,
    )

    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + Math.sin(time * 1.4) * 0.035)
    }

    if (pulseRef.current) {
      pulseRef.current.scale.setScalar(1 + cycle * 0.55)
      const material = pulseRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.22 * (1 - cycle)
    }

    if (radiusSweepRef.current) {
      const midpoint = new THREE.Vector3()
        .copy(endpoint)
        .add(new THREE.Vector3(center.x, altitude + PATTERN_OVERLAY_OFFSET + 0.08, center.y))
        .multiplyScalar(0.5)
      radiusSweepRef.current.position.copy(midpoint)
      radiusSweepRef.current.rotation.set(0, -angle, 0)
    }

    if (orbitDotRef.current) {
      orbitDotRef.current.position.copy(endpoint)
    }
  })

  return (
    <>
      <mesh
        ref={ringRef}
        rotation-x={-Math.PI / 2}
        position={[center.x, altitude + PATTERN_FILL_OFFSET, center.y]}
      >
        <ringGeometry args={[Math.max(radius - 1.8, 6), radius + 1.8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} />
      </mesh>

      <mesh position={[center.x, altitude + PATTERN_OVERLAY_OFFSET, center.y]}>
        <sphereGeometry args={[1.9, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.96} />
      </mesh>

      <mesh
        ref={pulseRef}
        rotation-x={-Math.PI / 2}
        position={[center.x, altitude + PATTERN_OVERLAY_OFFSET + 0.02, center.y]}
      >
        <ringGeometry args={[3.2, 4.9, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>

      <group
        ref={radiusSweepRef}
        position={[center.x + radius / 2, altitude + PATTERN_OVERLAY_OFFSET + 0.08, center.y]}
      >
        <mesh>
          <boxGeometry args={[radius, 0.24, 0.24]} />
          <meshBasicMaterial color={color} transparent opacity={0.72} />
        </mesh>
      </group>

      <mesh ref={orbitDotRef} position={[center.x + radius, altitude + PATTERN_OVERLAY_OFFSET + 0.08, center.y]}>
        <sphereGeometry args={[1.35, 20, 20]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </>
  )
}

function SpiralPatternPolish({
  color,
  points,
  segments,
  waypoints,
  altitude,
}: {
  color: string
  points: MissionPoint[]
  segments: Array<[Vec2, Vec2]>
  waypoints: MissionWaypoint[]
  altitude: number
}) {
  const center = useMemo(
    () => getPatternCenter(points, segments, waypoints),
    [points, segments, waypoints],
  )
  const tipPoint = useMemo(
    () => getSpiralTip(segments, waypoints),
    [segments, waypoints],
  )
  const seedRef = useRef<THREE.Mesh>(null)
  const seedPulseRef = useRef<THREE.Mesh>(null)
  const tipRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    const pulse = 1 + Math.sin(time * 2.1) * 0.08

    if (seedRef.current) {
      seedRef.current.scale.setScalar(pulse)
    }

    if (seedPulseRef.current) {
      const cycle = (time * 0.9) % 1
      seedPulseRef.current.scale.setScalar(1 + cycle * 0.75)
      const material = seedPulseRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.18 * (1 - cycle)
    }

    if (tipRef.current) {
      tipRef.current.scale.setScalar(1 + Math.sin(time * 5.8) * 0.16)
    }
  })

  return (
    <>
      <mesh ref={seedRef} position={[center.x, altitude + PATTERN_OVERLAY_OFFSET + 0.06, center.y]}>
        <sphereGeometry args={[1.8, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.94} />
      </mesh>

      <mesh
        ref={seedPulseRef}
        rotation-x={-Math.PI / 2}
        position={[center.x, altitude + PATTERN_OVERLAY_OFFSET + 0.02, center.y]}
      >
        <ringGeometry args={[3, 4.8, 56]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} />
      </mesh>

      {tipPoint && (
        <mesh ref={tipRef} position={[tipPoint.x, altitude + PATTERN_OVERLAY_OFFSET + 0.08, tipPoint.y]}>
          <sphereGeometry args={[1.45, 22, 22]} />
          <meshBasicMaterial color={color} transparent opacity={0.98} />
        </mesh>
      )}
    </>
  )
}

function GridPatternPolish({
  color,
  segments,
  altitude,
}: {
  color: string
  segments: Array<[Vec2, Vec2]>
  altitude: number
}) {
  const { primarySegments, secondarySegments, intersections } = useMemo(
    () => splitGridPatternVisuals(segments),
    [segments],
  )

  return (
    <>
      {primarySegments.map(([start, end], index) => (
        <Line
          key={`grid-primary-${index}`}
          points={[
            toAltitudePlanePosition(start, altitude, PATTERN_OVERLAY_OFFSET),
            toAltitudePlanePosition(end, altitude, PATTERN_OVERLAY_OFFSET),
          ]}
          color={color}
          transparent
          opacity={0.18}
          lineWidth={4.8}
        />
      ))}

      {secondarySegments.map(([start, end], index) => (
        <Line
          key={`grid-secondary-${index}`}
          points={[
            toAltitudePlanePosition(start, altitude, PATTERN_OVERLAY_OFFSET + 0.02),
            toAltitudePlanePosition(end, altitude, PATTERN_OVERLAY_OFFSET + 0.02),
          ]}
          color={color}
          transparent
          opacity={0.28}
          lineWidth={4.2}
        />
      ))}

      {intersections.map((point, index) => (
        <IntersectionFlash
          key={`grid-intersection-${index}`}
          point={point}
          altitude={altitude}
          color={color}
        />
      ))}
    </>
  )
}

function CorridorPatternPolish({
  color,
  segments,
  altitude,
  mode,
}: {
  color: string
  segments: Array<[Vec2, Vec2]>
  altitude: number
  mode: 'preview' | 'generated'
}) {
  const bandRef = useRef<THREE.Group>(null)
  const axis = useMemo(() => getCorridorAxisVisual(segments), [segments])

  useFrame(({ clock }) => {
    if (!bandRef.current) {
      return
    }

    const baseScale = mode === 'generated' ? 1 : 0.92
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 1.4) * 0.06
    bandRef.current.scale.set(1, 1, baseScale * pulse)
  })

  if (!axis) {
    return null
  }

  return (
    <>
      <group
        ref={bandRef}
        position={[axis.center.x, altitude + PATTERN_FILL_OFFSET, axis.center.y]}
        rotation-y={-axis.angle}
      >
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[axis.length, axis.bandWidth]} />
          <meshBasicMaterial color={color} transparent opacity={0.1} />
        </mesh>
      </group>

      <Line
        points={[
          toAltitudePlanePosition(axis.start, altitude, PATTERN_OVERLAY_OFFSET + 0.02),
          toAltitudePlanePosition(axis.end, altitude, PATTERN_OVERLAY_OFFSET + 0.02),
        ]}
        color={color}
        transparent
        opacity={0.86}
        dashed={mode === 'preview'}
        dashSize={4}
        gapSize={3}
        lineWidth={4.6}
      />

      {buildArrowGlyphsForSegments([[axis.start, axis.end]], 2).map((glyph, index) => (
        <group key={`corridor-arrow-${index}`}>
          <Line
            points={[
              toAltitudePlanePosition(glyph.tip, altitude, PATTERN_OVERLAY_OFFSET + 0.05),
              toAltitudePlanePosition(glyph.left, altitude, PATTERN_OVERLAY_OFFSET + 0.05),
            ]}
            color={color}
            transparent
            opacity={0.82}
            lineWidth={2.4}
          />
          <Line
            points={[
              toAltitudePlanePosition(glyph.tip, altitude, PATTERN_OVERLAY_OFFSET + 0.05),
              toAltitudePlanePosition(glyph.right, altitude, PATTERN_OVERLAY_OFFSET + 0.05),
            ]}
            color={color}
            transparent
            opacity={0.82}
            lineWidth={2.4}
          />
        </group>
      ))}
    </>
  )
}

function IntersectionFlash({
  point,
  altitude,
  color,
}: {
  point: Vec2
  altitude: number
  color: string
}) {
  const flashRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!flashRef.current) {
      return
    }

    const cycle = (clock.getElapsedTime() * 1.6) % 1
    flashRef.current.scale.setScalar(1 + cycle * 0.55)
    const material = flashRef.current.material as THREE.MeshBasicMaterial
    material.opacity = 0.24 * (1 - cycle)
  })

  return (
    <>
      <mesh position={[point.x, altitude + PATTERN_OVERLAY_OFFSET + 0.03, point.y]}>
        <sphereGeometry args={[0.84, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.92} />
      </mesh>
      <mesh
        ref={flashRef}
        rotation-x={-Math.PI / 2}
        position={[point.x, altitude + PATTERN_OVERLAY_OFFSET + 0.01, point.y]}
      >
        <ringGeometry args={[1.5, 2.6, 36]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
    </>
  )
}

function buildWaypointSegments(
  waypoints: MissionWaypoint[],
): Array<[Vec2, Vec2]> {
  return waypoints.slice(1).map((waypoint, index) => [
    { x: waypoints[index].x, y: waypoints[index].y },
    { x: waypoint.x, y: waypoint.y },
  ])
}

function getWaypointSceneKey(
  waypoint: Pick<MissionWaypoint, 'x' | 'y' | 'z'>,
): string {
  return `${Math.round(waypoint.x * 100) / 100}:${
    Math.round(waypoint.y * 100) / 100
  }:${Math.round(waypoint.z * 100) / 100}`
}

function buildColoredRouteSegments({
  waypoints,
  waypointEstimateMap,
}: {
  waypoints: MissionWaypoint[]
  waypointEstimateMap: Map<number, WaypointBatteryEstimate>
}): Array<{ points: ScenePoint[]; color: string }> {
  return waypoints.slice(1).map((waypoint, index) => {
    const previousWaypoint = waypoints[index]
    const estimate = waypointEstimateMap.get(waypoint.id)
    const color = getSafetyLevelColor(estimate?.safetyLevel ?? 'safe')

    return {
      points: [
        toAltitudePlanePosition(previousWaypoint, previousWaypoint.z, ALTITUDE_LINE_OFFSET),
        toAltitudePlanePosition(waypoint, waypoint.z, ALTITUDE_LINE_OFFSET),
      ],
      color,
    }
  })
}

function getSafetyLevelColor(level: SafetyLevel): string {
  switch (level) {
    case 'safe':
      return '#10b981'
    case 'caution':
      return '#eab308'
    case 'warning':
      return '#f97316'
    case 'critical':
      return '#ef4444'
  }
}

function buildRouteDirectionChevrons(
  segments: Array<[Vec2, Vec2]>,
  altitude: number,
): ScenePoint[][] {
  if (segments.length === 0) {
    return []
  }

  const step = Math.max(1, Math.floor(segments.length / 7))
  const chevrons: ScenePoint[][] = []

  for (let index = 0; index < segments.length; index += step) {
    const [start, end] = segments[index]
    const length = distanceBetween2D(start, end)

    if (length < 8) {
      continue
    }

    const direction = {
      x: (end.x - start.x) / length,
      y: (end.y - start.y) / length,
    }
    const normal = {
      x: -direction.y,
      y: direction.x,
    }
    const tip = lerpPoint(start, end, 0.58)
    const base = {
      x: tip.x - direction.x * 4.8,
      y: tip.y - direction.y * 4.8,
    }
    const left = {
      x: base.x + normal.x * 2.2,
      y: base.y + normal.y * 2.2,
    }
    const right = {
      x: base.x - normal.x * 2.2,
      y: base.y - normal.y * 2.2,
    }

    chevrons.push([
      toAltitudePlanePosition(left, altitude, ALTITUDE_LINE_OFFSET + 0.05),
      toAltitudePlanePosition(tip, altitude, ALTITUDE_LINE_OFFSET + 0.05),
      toAltitudePlanePosition(right, altitude, ALTITUDE_LINE_OFFSET + 0.05),
    ])
  }

  return chevrons.slice(0, 8)
}

function buildOrderedPathFromSegments(
  segments: Array<[Vec2, Vec2]>,
): Vec2[] {
  if (segments.length === 0) {
    return []
  }

  return [segments[0][0], ...segments.map((segment) => segment[1])]
}

function getCoverageSegmentGroups(
  segments: Array<[Vec2, Vec2]>,
  points: MissionPoint[],
): {
  sweepSegments: Array<[Vec2, Vec2]>
  connectorSegments: Array<[Vec2, Vec2]>
  directionAngle: number
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    width: number
    height: number
    center: Vec2
  }
} {
  if (segments.length === 0) {
    const bounds = getVisualBounds(points, segments)

    return {
      sweepSegments: [],
      connectorSegments: [],
      directionAngle: 0,
      bounds,
    }
  }

  const bounds = getVisualBounds(points, segments)
  const majorDimension = Math.max(bounds.width, bounds.height)
  const threshold = majorDimension * 0.28
  const sweepSegments = segments.filter(
    ([start, end]) => distanceBetween2D(start, end) >= threshold,
  )
  const connectorSegments = segments.filter(
    ([start, end]) => distanceBetween2D(start, end) < threshold,
  )
  const referenceSegment =
    sweepSegments[0] ??
    segments.reduce((longest, current) =>
      distanceBetween2D(current[0], current[1]) >
      distanceBetween2D(longest[0], longest[1])
        ? current
        : longest,
    )
  const directionAngle = Math.atan2(
    referenceSegment[1].y - referenceSegment[0].y,
    referenceSegment[1].x - referenceSegment[0].x,
  )

  return {
    sweepSegments,
    connectorSegments,
    directionAngle,
    bounds,
  }
}

function getPatternCenter(
  points: MissionPoint[],
  segments: Array<[Vec2, Vec2]>,
  waypoints: MissionWaypoint[],
): Vec2 {
  if (waypoints.length > 0) {
    return polygonCentroid(waypoints)
  }

  if (points.length > 0) {
    return polygonCentroid(points)
  }

  if (segments.length > 0) {
    const cloud = segments.flatMap(([start, end]) => [start, end])
    return polygonCentroid(cloud)
  }

  return WORLD_CENTER
}

function getOrbitRadius(
  center: Vec2,
  points: MissionPoint[],
  segments: Array<[Vec2, Vec2]>,
  waypoints: MissionWaypoint[],
): number {
  const cloud =
    waypoints.length > 0
      ? waypoints
      : points.length > 0
        ? points
        : segments.flatMap(([start, end]) => [start, end])

  if (cloud.length === 0) {
    return 18
  }

  const distances = cloud.map((point) => distanceBetween2D(point, center))
  const averageDistance =
    distances.reduce((sum, distance) => sum + distance, 0) / distances.length

  return Math.max(averageDistance, 18)
}

function getSpiralTip(
  segments: Array<[Vec2, Vec2]>,
  waypoints: MissionWaypoint[],
): Vec2 | null {
  if (waypoints.length > 0) {
    const lastWaypoint = waypoints[waypoints.length - 1]

    return { x: lastWaypoint.x, y: lastWaypoint.y }
  }

  if (segments.length > 0) {
    return segments[segments.length - 1][1]
  }

  return null
}

function splitGridPatternVisuals(
  segments: Array<[Vec2, Vec2]>,
): {
  primarySegments: Array<[Vec2, Vec2]>
  secondarySegments: Array<[Vec2, Vec2]>
  intersections: Vec2[]
} {
  const midpoint = Math.ceil(segments.length / 2)
  const primarySegments = segments.slice(0, midpoint)
  const secondarySegments = segments.slice(midpoint)
  const intersections: Vec2[] = []

  primarySegments.forEach(([startA, endA]) => {
    secondarySegments.forEach(([startB, endB]) => {
      const point = getSegmentIntersection(startA, endA, startB, endB)

      if (point) {
        intersections.push(point)
      }
    })
  })

  return {
    primarySegments,
    secondarySegments,
    intersections: dedupePoints(intersections).slice(0, 24),
  }
}

function getCorridorAxisVisual(
  segments: Array<[Vec2, Vec2]>,
): {
  start: Vec2
  end: Vec2
  center: Vec2
  angle: number
  length: number
  bandWidth: number
} | null {
  if (segments.length === 0) {
    return null
  }

  const longestSegment = segments.reduce((longest, current) =>
    distanceBetween2D(current[0], current[1]) >
    distanceBetween2D(longest[0], longest[1])
      ? current
      : longest,
  )
  const center = midpointOf(longestSegment[0], longestSegment[1])
  const angle = Math.atan2(
    longestSegment[1].y - longestSegment[0].y,
    longestSegment[1].x - longestSegment[0].x,
  )
  const length = distanceBetween2D(longestSegment[0], longestSegment[1])
  const distances = segments.map((segment) =>
    distancePointToInfiniteLine(midpointOf(segment[0], segment[1]), longestSegment[0], longestSegment[1]),
  )
  const bandWidth = Math.max(Math.max(...distances, 0) * 2 + 12, 16)

  return {
    start: longestSegment[0],
    end: longestSegment[1],
    center,
    angle,
    length,
    bandWidth,
  }
}

function buildArrowGlyphsForSegments(
  segments: Array<[Vec2, Vec2]>,
  count: number,
): Array<{ tip: Vec2; left: Vec2; right: Vec2 }> {
  if (segments.length === 0 || count <= 0) {
    return []
  }

  const step = Math.max(1, Math.floor(segments.length / count))
  const glyphs: Array<{ tip: Vec2; left: Vec2; right: Vec2 }> = []

  for (let index = 0; index < segments.length; index += step) {
    const [start, end] = segments[index]
    const length = distanceBetween2D(start, end)

    if (length < 6) {
      continue
    }

    const direction = {
      x: (end.x - start.x) / length,
      y: (end.y - start.y) / length,
    }
    const normal = {
      x: -direction.y,
      y: direction.x,
    }
    const tip = lerpPoint(start, end, 0.58)
    const base = {
      x: tip.x - direction.x * 4.8,
      y: tip.y - direction.y * 4.8,
    }

    glyphs.push({
      tip,
      left: {
        x: base.x + normal.x * 2.1,
        y: base.y + normal.y * 2.1,
      },
      right: {
        x: base.x - normal.x * 2.1,
        y: base.y - normal.y * 2.1,
      },
    })
  }

  return glyphs.slice(0, count)
}

function getVisualBounds(
  points: MissionPoint[],
  segments: Array<[Vec2, Vec2]>,
): {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
  center: Vec2
} {
  const cloud =
    points.length > 0 ? points : segments.flatMap(([start, end]) => [start, end])

  if (cloud.length === 0) {
    return {
      minX: -10,
      maxX: 10,
      minY: -10,
      maxY: 10,
      width: 20,
      height: 20,
      center: WORLD_CENTER,
    }
  }

  const xs = cloud.map((point) => point.x)
  const ys = cloud.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(maxX - minX, 10),
    height: Math.max(maxY - minY, 10),
    center: {
      x: minX + (maxX - minX) / 2,
      y: minY + (maxY - minY) / 2,
    },
  }
}

function getSegmentIntersection(
  startA: Vec2,
  endA: Vec2,
  startB: Vec2,
  endB: Vec2,
): Vec2 | null {
  const denominator =
    (endA.x - startA.x) * (endB.y - startB.y) -
    (endA.y - startA.y) * (endB.x - startB.x)

  if (Math.abs(denominator) < 0.001) {
    return null
  }

  const ua =
    ((endB.x - startB.x) * (startA.y - startB.y) -
      (endB.y - startB.y) * (startA.x - startB.x)) /
    denominator
  const ub =
    ((endA.x - startA.x) * (startA.y - startB.y) -
      (endA.y - startA.y) * (startA.x - startB.x)) /
    denominator

  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
    return null
  }

  return {
    x: startA.x + ua * (endA.x - startA.x),
    y: startA.y + ua * (endA.y - startA.y),
  }
}

function dedupePoints(points: Vec2[]): Vec2[] {
  return points.filter((point, index) =>
    points.findIndex(
      (candidate) =>
        Math.abs(candidate.x - point.x) < 0.6 &&
        Math.abs(candidate.y - point.y) < 0.6,
    ) === index,
  )
}

function midpointOf(start: Vec2, end: Vec2): Vec2 {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
}

function lerpPoint(start: Vec2, end: Vec2, t: number): Vec2 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  }
}

function distancePointToInfiniteLine(
  point: Vec2,
  lineStart: Vec2,
  lineEnd: Vec2,
): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y

  if (dx === 0 && dy === 0) {
    return distanceBetween2D(point, lineStart)
  }

  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
    Math.sqrt(dx * dx + dy * dy)
}

function distanceBetween2D(
  start: Pick<Vec2, 'x' | 'y'>,
  end: Pick<Vec2, 'x' | 'y'>,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y

  return Math.sqrt(dx * dx + dy * dy)
}

function getRectBorder(height: number): ScenePoint[] {
  return [
    [WORLD_BOUNDS.minX, height, WORLD_BOUNDS.minY],
    [WORLD_BOUNDS.maxX, height, WORLD_BOUNDS.minY],
    [WORLD_BOUNDS.maxX, height, WORLD_BOUNDS.maxY],
    [WORLD_BOUNDS.minX, height, WORLD_BOUNDS.maxY],
    [WORLD_BOUNDS.minX, height, WORLD_BOUNDS.minY],
  ]
}

function toGroundSurfacePosition(point: Pick<MissionPoint, 'x' | 'y'>): ScenePoint {
  return [point.x, GROUND_SURFACE_HEIGHT, point.y]
}

function toAltitudePlanePosition(
  point: Pick<MissionPoint, 'x' | 'y'>,
  altitude: number,
  offset = 0,
): ScenePoint {
  return [point.x, altitude + offset, point.y]
}

function toAltitudeMarkerPosition(
  point: Pick<MissionPoint, 'x' | 'y'>,
  altitude: number,
  lift = ALTITUDE_MARKER_LIFT,
): ScenePoint {
  return [point.x, altitude + lift, point.y]
}

function toDronePosition(
  point: Pick<MissionPoint, 'x' | 'y'>,
  altitude: number,
): ScenePoint {
  return [point.x, altitude + DRONE_LIFT, point.y]
}

function buildPolygonShape(points: MissionPoint[]): THREE.Shape {
  const shape = new THREE.Shape()
  shape.moveTo(points[0].x, toShapePlaneY(points[0].y))

  points.slice(1).forEach((point) => {
    shape.lineTo(point.x, toShapePlaneY(point.y))
  })

  shape.lineTo(points[0].x, toShapePlaneY(points[0].y))

  return shape
}

function toShapePlaneY(value: number): number {
  return -value
}

function isPrimaryClickGesture(event: ThreeEvent<MouseEvent>): boolean {
  return event.button === 0 && event.delta <= MAX_CLICK_DELTA
}

function clampScenePoint(point: THREE.Vector3): Vec2 {
  return clampWorldPoint({
    x: point.x,
    y: point.z,
  })
}

function isWithinCloseSnapRadius({
  camera,
  bounds,
  clientX,
  clientY,
  point,
  altitude,
}: {
  camera: THREE.Camera
  bounds: DOMRect
  clientX: number
  clientY: number
  point: Pick<MissionPoint, 'x' | 'y'>
  altitude: number
}): boolean {
  const viewportPoint = projectScenePointToViewport(
    new THREE.Vector3(...toAltitudeMarkerPosition(point, altitude)),
    camera,
    bounds,
  )

  if (viewportPoint === null) {
    return false
  }

  const pointerX = clientX - bounds.left
  const pointerY = clientY - bounds.top

  return Math.hypot(pointerX - viewportPoint.x, pointerY - viewportPoint.y) <= CLOSE_SNAP_RADIUS_PX
}

function projectScenePointToViewport(
  point: THREE.Vector3,
  camera: THREE.Camera,
  bounds: DOMRect,
): Vec2 | null {
  const projected = point.clone().project(camera)

  if (projected.z < -1 || projected.z > 1) {
    return null
  }

  return {
    x: (projected.x * 0.5 + 0.5) * bounds.width,
    y: (-projected.y * 0.5 + 0.5) * bounds.height,
  }
}

type CameraAnimation = {
  elapsed: number
  duration: number
  fromPosition: THREE.Vector3
  fromTarget: THREE.Vector3
  toPosition: THREE.Vector3
  toTarget: THREE.Vector3
}

type PreviewTransition = {
  phase: 'fade-out' | 'hold' | 'reveal'
  elapsed: number
  fromPattern: FlightPatternId
  toPattern: FlightPatternId
  fromSegments: Array<[Vec2, Vec2]>
  toSegments: Array<[Vec2, Vec2]>
}

type TimedRevealAnimation = {
  elapsed: number
  duration: number
}

function getPreviewPhaseProgress(transition: PreviewTransition): number {
  const duration =
    transition.phase === 'fade-out'
      ? PREVIEW_FADE_OUT_DURATION
      : transition.phase === 'hold'
        ? PREVIEW_GAP_DURATION
        : PREVIEW_REVEAL_DURATION

  return Math.min(transition.elapsed / duration, 1)
}

function getDisplayedPreviewSegments(
  transition: PreviewTransition | null,
  patternSegments: Array<[Vec2, Vec2]>,
): Array<[Vec2, Vec2]> {
  if (!transition) {
    return patternSegments
  }

  if (transition.phase === 'fade-out') {
    return transition.fromSegments
  }

  if (transition.phase === 'hold') {
    return []
  }

  return transition.toSegments.slice(
    0,
    getRevealCount(transition.toSegments.length, getPreviewPhaseProgress(transition)),
  )
}

function getRevealedWaypoints(
  waypoints: MissionWaypoint[],
  animation: TimedRevealAnimation | null,
): MissionWaypoint[] {
  if (!animation) {
    return waypoints
  }

  return waypoints.slice(
    0,
    getRevealCount(waypoints.length, animation.elapsed / animation.duration),
  )
}

function getRevealCount(total: number, progress: number): number {
  if (total === 0 || progress <= 0) {
    return 0
  }

  if (progress >= 1) {
    return total
  }

  return Math.min(total, Math.max(1, Math.ceil(total * progress)))
}

function getMissionFitFrame({
  camera,
  controls,
  points,
  waypoints,
  altitude,
}: {
  camera: THREE.PerspectiveCamera
  controls: OrbitControlsHandle
  points: MissionPoint[]
  waypoints: MissionWaypoint[]
  altitude: number
}): { position: THREE.Vector3; target: THREE.Vector3 } | null {
  const focusPoints = [
    ...points.map((point) => new THREE.Vector3(point.x, altitude, point.y)),
    ...waypoints.map(
      (waypoint) => new THREE.Vector3(waypoint.x, waypoint.z, waypoint.y),
    ),
  ]

  if (focusPoints.length === 0) {
    return null
  }

  const bounds = new THREE.Box3().setFromPoints(focusPoints)
  const sphere = bounds.getBoundingSphere(new THREE.Sphere())
  const fitCenter = sphere.center
  const fitRadius = Math.max(sphere.radius, 18)
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 1))
  const limitingFov = Math.min(verticalFov, horizontalFov)
  const fitDistance = THREE.MathUtils.clamp(
    (fitRadius * FIT_PADDING) / Math.sin(limitingFov / 2),
    MIN_CAMERA_DISTANCE,
    MAX_CAMERA_DISTANCE,
  )
  const currentDirection = camera.position.clone().sub(controls.target)

  if (currentDirection.lengthSq() === 0) {
    currentDirection.set(...CAMERA_POSITION).sub(
      new THREE.Vector3(fitCenter.x, fitCenter.y, fitCenter.z),
    )
  }

  currentDirection.normalize()

  return {
    position: fitCenter.clone().add(currentDirection.multiplyScalar(fitDistance)),
    target: fitCenter.clone(),
  }
}

function getDrawingFitDistance(
  points: MissionPoint[],
  cameraFov: number,
  cameraAspect: number,
  altitude: number,
): number {
  if (points.length < 2) {
    return 0
  }

  const pointCloud = points.map(
    (point) => new THREE.Vector3(point.x, altitude, point.y),
  )
  const bounds = new THREE.Box3().setFromPoints(pointCloud)
  const sphere = bounds.getBoundingSphere(new THREE.Sphere())
  const fitRadius = Math.max(sphere.radius, 18)
  const verticalFov = THREE.MathUtils.degToRad(cameraFov)
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(cameraAspect, 1))
  const limitingFov = Math.min(verticalFov, horizontalFov)

  return THREE.MathUtils.clamp(
    (fitRadius * DRAWING_FIT_PADDING) / Math.sin(limitingFov / 2),
    MIN_CAMERA_DISTANCE,
    MAX_CAMERA_DISTANCE,
  )
}

function arePointsEquivalent(
  left: Vec2 | null,
  right: Vec2 | null,
  epsilon = 0.02,
): boolean {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return left === right
  }

  return Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon
}

function getGeneratedFocusTarget({
  missionCenter,
  selectedWaypoint,
  altitude,
}: {
  missionCenter: Vec2
  selectedWaypoint: MissionWaypoint | null
  altitude: number
}): THREE.Vector3 {
  const baseTarget = new THREE.Vector3(missionCenter.x, altitude, missionCenter.y)

  if (!selectedWaypoint) {
    return baseTarget
  }

  return baseTarget.lerp(
    new THREE.Vector3(
      selectedWaypoint.x,
      selectedWaypoint.z,
      selectedWaypoint.y,
    ),
    GENERATED_SELECTION_BLEND,
  )
}

function advanceCameraAnimation({
  animation,
  camera,
  controls,
  delta,
}: {
  animation: CameraAnimation
  camera: THREE.PerspectiveCamera
  controls: OrbitControlsHandle
  delta: number
}): boolean {
  animation.elapsed = Math.min(animation.elapsed + delta, animation.duration)

  const progress = animation.duration === 0 ? 1 : animation.elapsed / animation.duration
  const easedProgress = 1 - (1 - progress) ** 3
  const nextPosition = animation.fromPosition
    .clone()
    .lerp(animation.toPosition, easedProgress)
  const nextTarget = animation.fromTarget
    .clone()
    .lerp(animation.toTarget, easedProgress)

  camera.position.copy(nextPosition)
  controls.target.copy(nextTarget)
  controls.update()

  return progress >= 1
}

function buildPatternPreviewSeries(
  pattern: FlightPatternId,
  points: MissionPoint[],
  altitude: number,
): ScenePoint[][] {
  if (points.length < 3) {
    return []
  }

  const centroid = polygonCentroid(points)
  const bounds = getPointBounds(points)
  const width = Math.max(bounds.maxX - bounds.minX, 18)
  const height = Math.max(bounds.maxY - bounds.minY, 18)
  const horizontalRadius = width * 0.38
  const verticalRadius = height * 0.38

  switch (pattern) {
    case 'perimeter':
      return [[
        ...points.map((point) => toAltitudePlanePosition(point, altitude, ALTITUDE_LINE_OFFSET)),
        toAltitudePlanePosition(points[0], altitude, ALTITUDE_LINE_OFFSET),
      ]]
    case 'orbit':
      return [buildEllipseSeries(centroid, horizontalRadius, verticalRadius, altitude, 36)]
    case 'spiral':
      return [buildSpiralSeries(centroid, horizontalRadius, verticalRadius, altitude)]
    case 'grid':
      return buildGridSeries(bounds, altitude)
    case 'corridor':
      return buildCorridorSeries(bounds, centroid, altitude)
    case 'coverage':
      return []
  }
}

function buildEllipseSeries(
  center: Vec2,
  radiusX: number,
  radiusY: number,
  altitude: number,
  segments: number,
): ScenePoint[] {
  const points: ScenePoint[] = []

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    points.push([
      center.x + Math.cos(angle) * radiusX,
      altitude + ALTITUDE_LINE_OFFSET,
      center.y + Math.sin(angle) * radiusY,
    ])
  }

  return points
}

function buildSpiralSeries(
  center: Vec2,
  radiusX: number,
  radiusY: number,
  altitude: number,
): ScenePoint[] {
  const points: ScenePoint[] = []
  const steps = 42

  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps
    const angle = progress * Math.PI * 4.6
    const currentRadiusX = radiusX * (1 - progress * 0.82)
    const currentRadiusY = radiusY * (1 - progress * 0.82)
    points.push([
      center.x + Math.cos(angle) * currentRadiusX,
      altitude + ALTITUDE_LINE_OFFSET,
      center.y + Math.sin(angle) * currentRadiusY,
    ])
  }

  return points
}

function buildGridSeries(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  altitude: number,
): ScenePoint[][] {
  const inset = 6
  const step = 18
  const series: ScenePoint[][] = []

  for (let x = bounds.minX + inset; x <= bounds.maxX - inset; x += step) {
    series.push([
      [x, altitude + ALTITUDE_LINE_OFFSET, bounds.minY + inset],
      [x, altitude + ALTITUDE_LINE_OFFSET, bounds.maxY - inset],
    ])
  }

  for (let y = bounds.minY + inset; y <= bounds.maxY - inset; y += step) {
    series.push([
      [bounds.minX + inset, altitude + ALTITUDE_LINE_OFFSET, y],
      [bounds.maxX - inset, altitude + ALTITUDE_LINE_OFFSET, y],
    ])
  }

  return series
}

function buildCorridorSeries(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  center: Vec2,
  altitude: number,
): ScenePoint[][] {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const corridorOffset = 10

  if (width >= height) {
    return [
      [
        [bounds.minX, altitude + ALTITUDE_LINE_OFFSET, center.y],
        [bounds.maxX, altitude + ALTITUDE_LINE_OFFSET, center.y],
      ],
      [
        [bounds.minX + 8, altitude + ALTITUDE_LINE_OFFSET, center.y - corridorOffset],
        [bounds.maxX - 8, altitude + ALTITUDE_LINE_OFFSET, center.y - corridorOffset],
      ],
      [
        [bounds.minX + 8, altitude + ALTITUDE_LINE_OFFSET, center.y + corridorOffset],
        [bounds.maxX - 8, altitude + ALTITUDE_LINE_OFFSET, center.y + corridorOffset],
      ],
    ]
  }

  return [
    [
      [center.x, altitude + ALTITUDE_LINE_OFFSET, bounds.minY],
      [center.x, altitude + ALTITUDE_LINE_OFFSET, bounds.maxY],
    ],
    [
      [center.x - corridorOffset, altitude + ALTITUDE_LINE_OFFSET, bounds.minY + 8],
      [center.x - corridorOffset, altitude + ALTITUDE_LINE_OFFSET, bounds.maxY - 8],
    ],
    [
      [center.x + corridorOffset, altitude + ALTITUDE_LINE_OFFSET, bounds.minY + 8],
      [center.x + ALTITUDE_LINE_OFFSET * 0 + corridorOffset, altitude + ALTITUDE_LINE_OFFSET, bounds.maxY - 8],
    ],
  ]
}

function getPointBounds(points: MissionPoint[]) {
  return points.reduce(
    (accumulator, point) => ({
      minX: Math.min(accumulator.minX, point.x),
      maxX: Math.max(accumulator.maxX, point.x),
      minY: Math.min(accumulator.minY, point.y),
      maxY: Math.max(accumulator.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )
}

function toScenePositionFromVec3(point: { x: number; y: number; z: number }): ScenePoint {
  return [point.x, point.y, point.z]
}

function toHeadingScenePoint(point: { x: number; y: number; z: number }): ScenePoint {
  return [point.x, point.y, point.z]
}

function distanceBetweenScenePoints(a: ScenePoint, b: ScenePoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function formatDragNumber(value: number): string {
  return value.toFixed(1)
}

function formatSignedDistance(value: number): string {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}m`
}

function getCameraPolarAngleDeg(
  cameraPosition: THREE.Vector3,
  target: THREE.Vector3 | null,
): number {
  if (!target) {
    return 45
  }

  const offset = cameraPosition.clone().sub(target)
  const distance = offset.length()

  if (distance === 0) {
    return 45
  }

  return THREE.MathUtils.radToDeg(
    Math.acos(THREE.MathUtils.clamp(offset.y / distance, -1, 1)),
  )
}

function formatSimulationCueLabel(actionType: string): string {
  switch (actionType) {
    case 'take_photo':
      return 'Camera pass'
    case 'record_video':
      return 'REC'
    case 'drop_payload':
      return 'Payload drop'
    case 'fire_suppress':
      return 'Suppress'
    case 'change_altitude':
      return 'Altitude change'
    case 'set_gimbal':
      return 'Gimbal set'
    case 'trigger_sensor':
      return 'Sensor trigger'
    case 'grid_pass_two':
      return 'Pass 2/2'
    default:
      return 'Hover'
  }
}

function getWaypointActionViewportIcon(
  actionType: MissionWaypointActionType,
): LucideIcon {
  switch (actionType) {
    case 'take_photo':
      return Camera
    case 'record_video':
      return Video
    case 'drop_payload':
      return Package
    case 'fire_suppress':
      return Flame
    case 'change_altitude':
      return MoveVertical
    case 'set_gimbal':
      return Aperture
    case 'trigger_sensor':
      return ScanSearch
    case 'hover':
    default:
      return TimerReset
  }
}

function getPreviewOrbitCameraPosition({
  fixedPosition,
  fixedTarget,
  elapsedMs,
  patternId,
  orbit,
}: {
  fixedPosition: THREE.Vector3
  fixedTarget: THREE.Vector3
  elapsedMs: number
  patternId: FlightPatternId
  orbit: NonNullable<SimulationCameraProfile['previewOrbit']>
}): THREE.Vector3 {
  const baseOffset = fixedPosition.clone().sub(fixedTarget)
  const baseDistance = baseOffset.length()

  if (baseDistance === 0) {
    return fixedPosition.clone()
  }

  const basePolar = Math.acos(
    THREE.MathUtils.clamp(baseOffset.y / baseDistance, -1, 1),
  )
  const baseAzimuth = Math.atan2(baseOffset.x, baseOffset.z)
  const cycleProgress =
    orbit.cycleDurationMs <= 0
      ? 0
      : ((elapsedMs % orbit.cycleDurationMs) / orbit.cycleDurationMs) * Math.PI * 2
  const patternScale =
    patternId === 'coverage' || patternId === 'grid' || patternId === 'corridor'
      ? 0.82
      : 1
  const azimuthAmplitude = THREE.MathUtils.degToRad(
    orbit.azimuthAmplitudeDeg * patternScale,
  )
  const polarAmplitude = THREE.MathUtils.degToRad(
    orbit.polarAmplitudeDeg * patternScale,
  )
  const azimuth = baseAzimuth + Math.sin(cycleProgress) * azimuthAmplitude
  const polar = THREE.MathUtils.clamp(
    basePolar + Math.sin(cycleProgress * 0.85) * polarAmplitude,
    THREE.MathUtils.degToRad(60),
    THREE.MathUtils.degToRad(64),
  )
  const planarDistance = Math.sin(polar) * baseDistance
  const zDrift = Math.sin(cycleProgress * 1.12 + Math.PI / 6) * orbit.zDrift * patternScale

  return fixedTarget
    .clone()
    .add(
      new THREE.Vector3(
        Math.sin(azimuth) * planarDistance,
        Math.cos(polar) * baseDistance,
        Math.cos(azimuth) * planarDistance + zDrift,
      ),
    )
}

function getSimulationCameraProfile(
  totalPathLength: number,
  patternId: FlightPatternId,
  source: DroneSimulationSession['source'],
): SimulationCameraProfile {
  if (source === 'preview') {
    const fixedPosition = new THREE.Vector3(...DRONE_SIMULATION_PREVIEW_CAMERA_POSITION)
    const fixedTarget = new THREE.Vector3(...DRONE_SIMULATION_PREVIEW_CAMERA_TARGET)
    const fixedOffset = fixedPosition.clone().sub(fixedTarget)
    const fixedDistance = fixedOffset.length()
    const fixedPolarAngle =
      fixedDistance === 0
        ? DRONE_SIMULATION_CAMERA_DESIRED_POLAR_ANGLE
        : Math.acos(THREE.MathUtils.clamp(fixedOffset.y / fixedDistance, -1, 1))

    return {
      desiredDistance: fixedDistance,
      minDistance: Math.max(MIN_CAMERA_DISTANCE, fixedDistance - 48),
      maxDistance: Math.min(MAX_CAMERA_DISTANCE, fixedDistance + 48),
      desiredPolarAngle: fixedPolarAngle,
      minPolarAngle: Math.max(DEFAULT_MIN_POLAR_ANGLE, fixedPolarAngle - 0.16),
      maxPolarAngle: Math.min(DEFAULT_MAX_POLAR_ANGLE, fixedPolarAngle + 0.16),
      desiredFov: DRONE_SIMULATION_PREVIEW_CAMERA_FOV,
      lookAheadDistance: 0,
      missionCenterBlend: 1,
      heightBias: 0,
      targetLerpSpeed: DRONE_SIMULATION_CAMERA_TARGET_LERP_SPEED * 0.9,
      positionLerpSpeed: DRONE_SIMULATION_CAMERA_POSITION_LERP_SPEED * 0.9,
      recoveryLerpSpeed: DRONE_SIMULATION_CAMERA_RECOVERY_LERP_SPEED,
      fixedPosition,
      fixedTarget,
      previewOrbit: {
        azimuthAmplitudeDeg: DRONE_SIMULATION_PREVIEW_CAMERA_ORBIT_AZIMUTH_AMPLITUDE_DEG,
        polarAmplitudeDeg: DRONE_SIMULATION_PREVIEW_CAMERA_ORBIT_POLAR_AMPLITUDE_DEG,
        cycleDurationMs: DRONE_SIMULATION_PREVIEW_CAMERA_ORBIT_CYCLE_MS,
        zDrift: DRONE_SIMULATION_PREVIEW_CAMERA_ORBIT_Z_DRIFT,
      },
    }
  }

  const overviewBias =
    patternId === 'coverage' || patternId === 'grid' || patternId === 'corridor'
      ? 1
      : patternId === 'spiral'
        ? 0.82
        : patternId === 'perimeter'
          ? 0.68
          : 0.58
  const maxDistance =
    patternId === 'corridor'
      ? DRONE_SIMULATION_CAMERA_MAX_DISTANCE
      : DRONE_SIMULATION_CAMERA_MAX_DISTANCE - 10
  const desiredDistance = THREE.MathUtils.clamp(
    104 +
      totalPathLength *
        (patternId === 'corridor'
          ? 0.072
          : patternId === 'coverage' || patternId === 'grid'
            ? 0.058
            : 0.048),
    DRONE_SIMULATION_CAMERA_MIN_DISTANCE,
    maxDistance,
  )
  const desiredPolarAngle =
    patternId === 'corridor' || patternId === 'coverage' || patternId === 'grid'
      ? DRONE_SIMULATION_CAMERA_DESIRED_POLAR_ANGLE - 0.05
      : patternId === 'orbit'
        ? DRONE_SIMULATION_CAMERA_DESIRED_POLAR_ANGLE - 0.01
        : DRONE_SIMULATION_CAMERA_DESIRED_POLAR_ANGLE - 0.02
  const lookAheadDistance = THREE.MathUtils.clamp(
    desiredDistance * (patternId === 'corridor' ? 0.14 : 0.1),
    8,
    18,
  )

  return {
    desiredDistance,
    minDistance: DRONE_SIMULATION_CAMERA_MIN_DISTANCE,
    maxDistance,
    desiredPolarAngle,
    minPolarAngle: DRONE_SIMULATION_CAMERA_MIN_POLAR_ANGLE,
    maxPolarAngle: DRONE_SIMULATION_CAMERA_MAX_POLAR_ANGLE,
    desiredFov:
      patternId === 'coverage' || patternId === 'grid' || patternId === 'corridor'
        ? DRONE_SIMULATION_CAMERA_DESIRED_FOV
        : DRONE_SIMULATION_CAMERA_DESIRED_FOV - 1,
    lookAheadDistance,
    missionCenterBlend:
      patternId === 'coverage' || patternId === 'grid' || patternId === 'corridor'
        ? 0.42
        : patternId === 'spiral'
          ? 0.34
          : 0.28,
    heightBias: patternId === 'orbit' ? 5 : 4 + overviewBias,
    targetLerpSpeed: DRONE_SIMULATION_CAMERA_TARGET_LERP_SPEED,
    positionLerpSpeed: DRONE_SIMULATION_CAMERA_POSITION_LERP_SPEED,
    recoveryLerpSpeed: DRONE_SIMULATION_CAMERA_RECOVERY_LERP_SPEED,
  }
}

function getSimulationFollowTarget({
  position,
  heading,
  profile,
  missionCenter,
}: {
  position: ScenePoint
  heading: ScenePoint
  profile: SimulationCameraProfile
  missionCenter: THREE.Vector3 | null
}): THREE.Vector3 {
  const focusDirection = getSimulationFlatHeadingVector(heading)
  const lookAheadTarget = new THREE.Vector3(
    position[0] + focusDirection.x * profile.lookAheadDistance,
    position[1],
    position[2] + focusDirection.z * profile.lookAheadDistance,
  )

  if (!missionCenter) {
    return lookAheadTarget
  }

  return lookAheadTarget.lerp(missionCenter, profile.missionCenterBlend)
}

function getSimulationFollowCameraPosition({
  desiredTarget,
  heading,
  currentCameraPosition,
  currentTarget,
  profile,
}: {
  desiredTarget: THREE.Vector3
  heading: ScenePoint
  currentCameraPosition: THREE.Vector3
  currentTarget: THREE.Vector3
  profile: SimulationCameraProfile
}): THREE.Vector3 {
  const focusDirection = getSimulationFlatHeadingVector(
    heading,
    currentCameraPosition.clone().sub(currentTarget),
  )
  const horizontalDistance =
    Math.sin(profile.desiredPolarAngle) * profile.desiredDistance
  const verticalDistance =
    Math.cos(profile.desiredPolarAngle) * profile.desiredDistance + profile.heightBias
  const desiredOffset = new THREE.Vector3(
    -focusDirection.x * horizontalDistance,
    verticalDistance,
    -focusDirection.z * horizontalDistance,
  )

  return desiredTarget.clone().add(desiredOffset)
}

function isSimulationCameraOutsideEnvelope(
  offset: THREE.Vector3,
  profile: SimulationCameraProfile,
): boolean {
  const distance = offset.length()

  if (distance === 0) {
    return true
  }

  const polarAngle = Math.acos(
    THREE.MathUtils.clamp(offset.y / distance, -1, 1),
  )

  return (
    distance < profile.minDistance ||
    distance > profile.maxDistance ||
    polarAngle < profile.minPolarAngle ||
    polarAngle > profile.maxPolarAngle
  )
}

function getSimulationFlatHeadingVector(
  heading: ScenePoint,
  fallbackVector?: THREE.Vector3,
): THREE.Vector3 {
  const vector = new THREE.Vector3(heading[0], 0, heading[2])

  if (vector.lengthSq() > 0.0001) {
    return vector.normalize()
  }

  if (fallbackVector) {
    fallbackVector.setY(0)

    if (fallbackVector.lengthSq() > 0.0001) {
      return fallbackVector.normalize()
    }
  }

  return new THREE.Vector3(0.72, 0, 0.72).normalize()
}

function getSimulationStatusLabel({
  patternId,
  currentWaypointIndex,
  waypointCount,
}: {
  patternId: FlightPatternId
  currentWaypointIndex: number
  waypointCount: number
}): string | null {
  if (waypointCount <= 1) {
    return null
  }

  switch (patternId) {
    case 'coverage':
      return `Line ${Math.min(Math.floor(currentWaypointIndex / 2) + 1, Math.ceil(waypointCount / 2))}/${Math.max(Math.ceil(waypointCount / 2), 1)}`
    case 'grid':
      return currentWaypointIndex >= Math.floor(waypointCount / 2) ? 'Pass 2/2' : 'Pass 1/2'
    case 'corridor':
      return 'Corridor run'
    default:
      return null
  }
}
