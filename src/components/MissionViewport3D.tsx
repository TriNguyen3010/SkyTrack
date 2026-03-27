import {
  Billboard,
  Grid,
  Line,
  OrbitControls,
  PerspectiveCamera,
  Text,
} from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
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
import type {
  MissionPoint,
  MissionStage,
  MissionWaypoint,
} from '../store/useMissionStore'

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
  minPolarAngle: number
  maxPolarAngle: number
}

interface MissionViewport3DProps {
  stage: MissionStage
  scanAltitude: number
  points: MissionPoint[]
  patternSegments: Array<[Vec2, Vec2]>
  waypoints: MissionWaypoint[]
  selectedWaypointId: number | null
  selectedPattern: FlightPatternId
  hoveredPattern: FlightPatternId | null
  patternPickerVisible: boolean
  waypointContextMenuVisible?: boolean
  skipAnimationToken: number
  onStartDrawing: () => void
  onAddPoint: (x: number, y: number) => void
  onUpdatePoint: (id: number, x: number, y: number) => void
  onClosePolygon: () => void
  onSelectWaypoint: (id: number | null) => void
  onHoveredWaypointChange?: (id: number | null) => void
  onWaypointContextMenu?: (request: WaypointContextMenuRequest) => void
  onReadyToCloseChange?: (ready: boolean) => void
  onPatternPickerAnchorChange?: (anchor: Vec2 | null) => void
  onAnimationStateChange?: (state: ViewportAnimationState) => void
}

export function MissionViewport3D({
  stage,
  scanAltitude,
  points,
  patternSegments,
  waypoints,
  selectedWaypointId,
  selectedPattern,
  hoveredPattern,
  patternPickerVisible,
  waypointContextMenuVisible = false,
  skipAnimationToken,
  onStartDrawing,
  onAddPoint,
  onUpdatePoint,
  onClosePolygon,
  onSelectWaypoint,
  onHoveredWaypointChange,
  onWaypointContextMenu,
  onReadyToCloseChange,
  onPatternPickerAnchorChange,
  onAnimationStateChange,
}: MissionViewport3DProps) {
  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null)
  const [draggingPointId, setDraggingPointId] = useState<number | null>(null)
  const [isGeneratedRevealActive, setIsGeneratedRevealActive] = useState(false)
  const [isPatternTransitionActive, setIsPatternTransitionActive] = useState(false)
  const [isRouteRevealActive, setIsRouteRevealActive] = useState(false)
  const previousSkipTokenRef = useRef(skipAnimationToken)
  const animationStateRef = useRef<ViewportAnimationState>('settled')
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const orbitControlsRef = useRef<OrbitControlsHandle | null>(null)
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
    if (points.length > 0) {
      return polygonCentroid(points)
    }

    if (waypoints.length > 0) {
      return polygonCentroid(waypoints)
    }

    return WORLD_CENTER
  }, [points, waypoints])

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

  return (
    <Canvas className="viewport-canvas" gl={{ antialias: true }}>
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
          patternSegments={patternSegments}
          waypoints={waypoints}
          selectedWaypointId={selectedWaypointId}
          selectedPattern={selectedPattern}
          hoveredPattern={hoveredPattern}
          patternPickerVisible={patternPickerVisible}
          waypointContextMenuVisible={waypointContextMenuVisible}
          inputLocked={isAnimationLocked}
          skipAnimationToken={skipAnimationToken}
          onStartDrawing={onStartDrawing}
          hoverPoint={hoverPoint}
          draggingPointId={draggingPointId}
          onAddPoint={onAddPoint}
          onUpdatePoint={onUpdatePoint}
          onClosePolygon={onClosePolygon}
          onSelectWaypoint={onSelectWaypoint}
          onHoveredWaypointChange={onHoveredWaypointChange}
          onWaypointContextMenu={onWaypointContextMenu}
          onReadyToCloseChange={onReadyToCloseChange}
          onPatternPickerAnchorChange={onPatternPickerAnchorChange}
          onHoverPointChange={setHoverPoint}
          onDraggingPointChange={setDraggingPointId}
          onPatternTransitionActiveChange={setIsPatternTransitionActive}
          onRouteRevealActiveChange={setIsRouteRevealActive}
        />
      </Suspense>

      <OrbitControls
        ref={(controls) => {
          orbitControlsRef.current = controls
        }}
        makeDefault
        enabled={
          draggingPointId === null &&
          !patternPickerVisible &&
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
          !patternPickerVisible &&
          !waypointContextMenuVisible &&
          !isAnimationLocked
        }
      />
      <DrawingCameraController
        stage={stage}
        scanAltitude={scanAltitude}
        points={points}
        cameraTarget={cameraTarget}
        draggingPointId={draggingPointId}
        patternPickerVisible={patternPickerVisible}
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
    </Canvas>
  )
}

interface MissionWorldProps extends MissionViewport3DProps {
  inputLocked: boolean
  skipAnimationToken: number
  hoverPoint: Vec2 | null
  draggingPointId: number | null
  onHoverPointChange: (point: Vec2 | null) => void
  onDraggingPointChange: (id: number | null) => void
  onPatternTransitionActiveChange: (active: boolean) => void
  onRouteRevealActiveChange: (active: boolean) => void
}

function MissionWorld({
  stage,
  scanAltitude,
  points,
  patternSegments,
  waypoints,
  selectedWaypointId,
  selectedPattern,
  hoveredPattern,
  patternPickerVisible,
  waypointContextMenuVisible = false,
  inputLocked,
  skipAnimationToken,
  onStartDrawing,
  hoverPoint,
  draggingPointId,
  onAddPoint,
  onUpdatePoint,
  onClosePolygon,
  onSelectWaypoint,
  onHoveredWaypointChange,
  onWaypointContextMenu,
  onReadyToCloseChange,
  onPatternPickerAnchorChange,
  onHoverPointChange,
  onDraggingPointChange,
  onPatternTransitionActiveChange,
  onRouteRevealActiveChange,
}: MissionWorldProps) {
  const { camera, gl } = useThree()
  const [isReadyToClose, setIsReadyToClose] = useState(false)
  const [previewTransition, setPreviewTransition] =
    useState<PreviewTransition | null>(null)
  const [routeRevealAnimation, setRouteRevealAnimation] =
    useState<TimedRevealAnimation | null>(null)
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

      const nextPoint = clampScenePoint(hitPoint)
      onUpdatePoint(activePointId, nextPoint.x, nextPoint.y)
    }

    function handlePointerUp() {
      onDraggingPointChange(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [camera, draggingPointId, gl, onDraggingPointChange, onUpdatePoint, scanAltitude])

  const canClosePolygon = stage === 'drawing' && points.length >= 3
  const isPlaneInteractive = stage === 'setup' || stage === 'drawing'
  const previewPolylinePoints = useMemo(() => {
    if (points.length === 0) {
      return [] as ScenePoint[]
    }

    const polyline = points.map((point) =>
      toAltitudePlanePosition(point, scanAltitude, ALTITUDE_LINE_OFFSET),
    )

    const snappedPreviewPoint = isReadyToClose ? points[0] : hoverPoint

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

    if (stage !== 'drawing' && points.length >= 3) {
      return [
        ...polyline,
        toAltitudePlanePosition(points[0], scanAltitude, ALTITUDE_LINE_OFFSET),
      ]
    }

    return polyline
  }, [hoverPoint, isPlaneInteractive, isReadyToClose, points, scanAltitude, stage])
  const hoverLinkPoints = useMemo(() => {
    if (!canClosePolygon || !hoverPoint || points.length === 0 || isReadyToClose) {
      return null
    }

    return [
      toAltitudePlanePosition(hoverPoint, scanAltitude, ALTITUDE_LINE_OFFSET),
      toAltitudePlanePosition(points[0], scanAltitude, ALTITUDE_LINE_OFFSET),
    ]
  }, [canClosePolygon, hoverPoint, isReadyToClose, points, scanAltitude])
  const polygonShape = useMemo(() => {
    if (points.length < 3) {
      return null
    }

    const shape = new THREE.Shape()
    shape.moveTo(points[0].x, toShapePlaneY(points[0].y))

    points.slice(1).forEach((point) => {
      shape.lineTo(point.x, toShapePlaneY(point.y))
    })

    shape.lineTo(points[0].x, toShapePlaneY(points[0].y))

    return shape
  }, [points])
  const routeLinePoints = useMemo(
    () =>
      waypoints.map((waypoint) =>
        toAltitudePlanePosition(waypoint, waypoint.z, ALTITUDE_LINE_OFFSET),
      ),
    [waypoints],
  )
  const revealedWaypoints = useMemo(
    () => getRevealedWaypoints(waypoints, routeRevealAnimation),
    [routeRevealAnimation, waypoints],
  )
  const revealedRouteLinePoints = useMemo(
    () => getRevealedRouteLinePoints(routeLinePoints, routeRevealAnimation),
    [routeLinePoints, routeRevealAnimation],
  )
  const revealedRouteSegments = useMemo(
    () => buildWaypointSegments(revealedWaypoints),
    [revealedWaypoints],
  )
  const selectedWaypoint =
    selectedWaypointId === null
      ? null
      : waypoints.find((waypoint) => waypoint.id === selectedWaypointId) ?? null

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
    onHoverPointChange(nextHoverPoint)

    if (!canClosePolygon || points.length === 0) {
      setIsReadyToClose(false)
      return
    }

    setIsReadyToClose(
      isWithinCloseSnapRadius({
        camera,
        bounds: gl.domElement.getBoundingClientRect(),
        clientX: event.clientX,
        clientY: event.clientY,
        point: points[0],
        altitude: scanAltitude,
      }),
    )
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
      setIsReadyToClose(false)
      onStartDrawing()
      onAddPoint(nextPoint.x, nextPoint.y)
      return
    }

    if (stage === 'drawing') {
      if (isReadyToClose && canClosePolygon) {
        onHoverPointChange(null)
        setIsReadyToClose(false)
        onClosePolygon()
        return
      }

      const nextPoint = clampScenePoint(event.point)
      setIsReadyToClose(false)
      onAddPoint(nextPoint.x, nextPoint.y)
      return
    }

    if (stage === 'generated') {
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
    onHoverPointChange(null)
    onDraggingPointChange(pointId)
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
      onHoverPointChange(null)
      setIsReadyToClose(false)
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
                onHoverPointChange(null)
                setIsReadyToClose(false)
              }
            }}
            onClick={handleAltitudePlaneClick}
          >
            <planeGeometry args={[WORLD_DIMENSIONS.width, WORLD_DIMENSIONS.height]} />
            <meshStandardMaterial
              color="#8b5cf6"
              transparent
              opacity={stage === 'setup' ? 0.14 : 0.08}
            />
          </mesh>

          <Grid
            position={[0, scanAltitude + ALTITUDE_PLANE_GRID_OFFSET, 0]}
            args={[WORLD_DIMENSIONS.width, WORLD_DIMENSIONS.height]}
            cellColor="#7c6bff"
            cellSize={12}
            cellThickness={0.55}
            fadeDistance={360}
            fadeStrength={1.2}
            infiniteGrid={false}
            sectionColor="#5b21f0"
            sectionSize={60}
            sectionThickness={1}
          />

          <Line
            points={getRectBorder(scanAltitude + ALTITUDE_PLANE_GRID_OFFSET)}
            color="#6d28d9"
            transparent
            opacity={stage === 'setup' ? 0.7 : 0.5}
            lineWidth={1.6}
          />
        </>
      )}

      {polygonShape && (stage !== 'drawing' || isReadyToClose) && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, scanAltitude + ALTITUDE_PLANE_FILL_OFFSET, 0]}
        >
          <shapeGeometry args={[polygonShape]} />
          <meshStandardMaterial
            color={stage === 'generated' ? selectedPatternColor : activePatternColor}
            transparent
            opacity={stage === 'generated' ? 0.14 : isReadyToClose ? 0.12 : 0.2}
          />
        </mesh>
      )}

      {(stage === 'drawing' || stage === 'editing') && previewPolylinePoints.length >= 2 && (
        <Line
          points={previewPolylinePoints}
          color={stage === 'editing' ? activePatternColor : '#7c6bff'}
          lineWidth={2.2}
          dashed={stage === 'drawing'}
          dashSize={4}
          gapSize={3}
        />
      )}

      {hoverLinkPoints && (
        <Line
          points={hoverLinkPoints}
          color={activePatternColor}
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
        revealedWaypoints.map((waypoint) => (
          <Line
            key={`stem-${waypoint.id}`}
            points={[
              toGroundSurfacePosition(waypoint),
              toAltitudeMarkerPosition(waypoint, waypoint.z),
            ]}
            color={selectedPatternColor}
            transparent
            opacity={selectedWaypointId === waypoint.id ? 0.9 : 0.32}
          />
        ))}

      {stage === 'generated' && revealedRouteLinePoints.length >= 2 && (
        <Line
          points={revealedRouteLinePoints}
          color={selectedPatternColor}
          lineWidth={3.2}
        />
      )}

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

      {(stage === 'drawing' || stage === 'editing') &&
        points.map((point, index) => (
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
                color="#7c6bff"
                emissive="#7c6bff"
                emissiveIntensity={0.18}
              />
            </mesh>

            <Billboard position={[0, 9, 0]} follow>
              <mesh>
                <circleGeometry args={[4.2, 36]} />
                <meshBasicMaterial color="#7c6bff" />
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
            color="#7c6bff"
          />
          <Line
            points={[
              [hoverPoint.x, scanAltitude + HOVER_OFFSET, hoverPoint.y - 3.5],
              [hoverPoint.x, scanAltitude + HOVER_OFFSET, hoverPoint.y + 3.5],
            ]}
            color="#7c6bff"
          />
          <mesh position={[hoverPoint.x, scanAltitude + HOVER_OFFSET, hoverPoint.y]}>
            <sphereGeometry args={[0.9, 20, 20]} />
            <meshBasicMaterial color="#7c6bff" transparent opacity={0.7} />
          </mesh>
        </>
      )}

      {stage === 'generated' &&
        revealedWaypoints.map((waypoint) => {
          const isSelected = waypoint.id === selectedWaypointId
          const actionCount = waypoint.actions.length

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

                onSelectWaypoint(waypoint.id)
              }}
              onContextMenu={(event) => {
                event.stopPropagation()
                event.nativeEvent.preventDefault()

                if (inputLocked) {
                  return
                }

                onWaypointContextMenu?.({
                  waypointId: waypoint.id,
                  clientX: event.clientX,
                  clientY: event.clientY,
                })
              }}
            >
              <mesh>
                <sphereGeometry args={[isSelected ? 2.7 : 2.3, 28, 28]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
              <mesh position={[0, 0.12, 0]}>
                <sphereGeometry args={[isSelected ? 1.6 : 1.4, 22, 22]} />
                <meshStandardMaterial
                  color={selectedPatternColor}
                  emissive={selectedPatternColor}
                  emissiveIntensity={isSelected ? 0.32 : 0.22}
                />
              </mesh>

              <Billboard position={[0, 8.6, 0]} follow>
                <mesh>
                  <circleGeometry args={[4.2, 36]} />
                  <meshBasicMaterial color={selectedPatternColor} />
                </mesh>
                <Text
                  position={[0, 0, 0.05]}
                  fontSize={3.2}
                  color="#ffffff"
                  anchorX="center"
                  anchorY="middle"
                >
                  {waypoint.id}
                </Text>
              </Billboard>

              {actionCount > 0 && (
                <Billboard position={[5.5, 4.8, 0]} follow>
                  <mesh>
                    <planeGeometry args={[7.6, 4.2]} />
                    <meshBasicMaterial color="#f97316" transparent opacity={0.98} />
                  </mesh>
                  <Text
                    position={[0, 0, 0.05]}
                    fontSize={2.2}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="middle"
                  >
                    A{actionCount}
                  </Text>
                </Billboard>
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

function DrawingCameraController({
  stage,
  scanAltitude,
  points,
  cameraTarget,
  draggingPointId,
  patternPickerVisible,
  waypointContextMenuVisible,
  animationLocked,
  orbitControlsRef,
}: {
  stage: MissionStage
  scanAltitude: number
  points: MissionPoint[]
  cameraTarget: Vec2
  draggingPointId: number | null
  patternPickerVisible: boolean
  waypointContextMenuVisible: boolean
  animationLocked: boolean
  orbitControlsRef: React.RefObject<OrbitControlsHandle | null>
}) {
  const { camera } = useThree()
  const desiredTarget = useMemo(
    () =>
      new THREE.Vector3(
        cameraTarget.x,
        stage === 'idle' ? 0 : scanAltitude,
        cameraTarget.y,
      ),
    [cameraTarget, scanAltitude, stage],
  )

  useEffect(() => {
    const controls = orbitControlsRef.current

    if (!controls) {
      return
    }

    controls.enabled =
      draggingPointId === null &&
      !patternPickerVisible &&
      !waypointContextMenuVisible &&
      !animationLocked
    controls.enablePan =
      stage !== 'drawing' &&
      !patternPickerVisible &&
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
    patternPickerVisible,
    stage,
    waypointContextMenuVisible,
  ])

  useFrame((_, delta) => {
    const controls = orbitControlsRef.current

    if (!controls || !(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    if (
      patternPickerVisible ||
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
      const desiredDistance = getDrawingFitDistance(points, camera, scanAltitude)

      if (desiredDistance > currentDistance + 0.5) {
        nextOffset.setLength(
          THREE.MathUtils.damp(
            currentDistance,
            desiredDistance,
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

        <Billboard position={[0, 10, 0]} follow>
          <mesh>
            <planeGeometry args={[18, 7]} />
            <meshBasicMaterial color={beaconColor} transparent opacity={0.96} />
          </mesh>
          <Text
            position={[0, 0, 0.04]}
            fontSize={2.8}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
          >
            {anchor.z}m
          </Text>
        </Billboard>
      </group>
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

function getRevealedRouteLinePoints(
  routeLinePoints: ScenePoint[],
  animation: TimedRevealAnimation | null,
): ScenePoint[] {
  if (!animation) {
    return routeLinePoints
  }

  return routeLinePoints.slice(
    0,
    getRevealCount(routeLinePoints.length, animation.elapsed / animation.duration),
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
  camera: THREE.PerspectiveCamera,
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
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 1))
  const limitingFov = Math.min(verticalFov, horizontalFov)

  return THREE.MathUtils.clamp(
    (fitRadius * DRAWING_FIT_PADDING) / Math.sin(limitingFov / 2),
    MIN_CAMERA_DISTANCE,
    MAX_CAMERA_DISTANCE,
  )
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
