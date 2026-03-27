import {
  Billboard,
  Grid,
  Line,
  OrbitControls,
  PerspectiveCamera,
  Text,
} from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
type ScenePoint = [number, number, number]
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
  onStartDrawing: () => void
  onAddPoint: (x: number, y: number) => void
  onUpdatePoint: (id: number, x: number, y: number) => void
  onClosePolygon: () => void
  onSelectWaypoint: (id: number | null) => void
  onReadyToCloseChange?: (ready: boolean) => void
  onPatternPickerAnchorChange?: (anchor: Vec2 | null) => void
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
  onStartDrawing,
  onAddPoint,
  onUpdatePoint,
  onClosePolygon,
  onSelectWaypoint,
  onReadyToCloseChange,
  onPatternPickerAnchorChange,
}: MissionViewport3DProps) {
  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null)
  const [draggingPointId, setDraggingPointId] = useState<number | null>(null)
  const [isGeneratedRevealActive, setIsGeneratedRevealActive] = useState(false)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const orbitControlsRef = useRef<OrbitControlsHandle | null>(null)

  const cameraTarget = useMemo(() => {
    if (points.length > 0) {
      return polygonCentroid(points)
    }

    if (waypoints.length > 0) {
      return polygonCentroid(waypoints)
    }

    return WORLD_CENTER
  }, [points, waypoints])

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
          generatedRevealLocked={isGeneratedRevealActive}
          onStartDrawing={onStartDrawing}
          hoverPoint={hoverPoint}
          draggingPointId={draggingPointId}
          onAddPoint={onAddPoint}
          onUpdatePoint={onUpdatePoint}
          onClosePolygon={onClosePolygon}
          onSelectWaypoint={onSelectWaypoint}
          onReadyToCloseChange={onReadyToCloseChange}
          onPatternPickerAnchorChange={onPatternPickerAnchorChange}
          onHoverPointChange={setHoverPoint}
          onDraggingPointChange={setDraggingPointId}
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
          !isGeneratedRevealActive
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
          !isGeneratedRevealActive
        }
      />
      <DrawingCameraController
        stage={stage}
        scanAltitude={scanAltitude}
        points={points}
        cameraTarget={cameraTarget}
        draggingPointId={draggingPointId}
        patternPickerVisible={patternPickerVisible}
        orbitControlsRef={orbitControlsRef}
      />
      <GeneratedCameraController
        stage={stage}
        scanAltitude={scanAltitude}
        points={points}
        waypoints={waypoints}
        selectedWaypointId={selectedWaypointId}
        orbitControlsRef={orbitControlsRef}
        onRevealActiveChange={setIsGeneratedRevealActive}
      />
    </Canvas>
  )
}

interface MissionWorldProps extends MissionViewport3DProps {
  generatedRevealLocked: boolean
  hoverPoint: Vec2 | null
  draggingPointId: number | null
  onHoverPointChange: (point: Vec2 | null) => void
  onDraggingPointChange: (id: number | null) => void
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
  generatedRevealLocked,
  onStartDrawing,
  hoverPoint,
  draggingPointId,
  onAddPoint,
  onUpdatePoint,
  onClosePolygon,
  onSelectWaypoint,
  onReadyToCloseChange,
  onPatternPickerAnchorChange,
  onHoverPointChange,
  onDraggingPointChange,
}: MissionWorldProps) {
  const { camera, gl } = useThree()
  const [isReadyToClose, setIsReadyToClose] = useState(false)
  const activePreviewPattern = stage === 'editing' ? hoveredPattern ?? selectedPattern : null
  const activePatternColor = activePreviewPattern
    ? getFlightPatternOption(activePreviewPattern).color
    : getFlightPatternOption(selectedPattern).color
  const selectedPatternColor = getFlightPatternOption(selectedPattern).color

  useEffect(() => {
    onReadyToCloseChange?.(isReadyToClose)
  }, [isReadyToClose, onReadyToCloseChange])

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

    if (generatedRevealLocked) {
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
      onSelectWaypoint(null)
    }
  }

  function handleVertexPointerDown(
    event: ThreeEvent<PointerEvent>,
    pointId: number,
  ) {
    if (stage !== 'editing') {
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
        patternSegments.map(([start, end], index) => (
          <Line
            key={`pattern-segment-${index}`}
            points={[
              toAltitudePlanePosition(start, scanAltitude, ALTITUDE_LINE_OFFSET),
              toAltitudePlanePosition(end, scanAltitude, ALTITUDE_LINE_OFFSET),
            ]}
            color={activePatternColor}
            transparent
            opacity={0.84}
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

      {stage === 'generated' &&
        waypoints.map((waypoint) => (
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

      {stage === 'generated' && routeLinePoints.length >= 2 && (
        <Line points={routeLinePoints} color={selectedPatternColor} lineWidth={3.2} />
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
        waypoints.map((waypoint) => {
          const isSelected = waypoint.id === selectedWaypointId
          const actionCount = waypoint.actions.length

          return (
            <group
              key={waypoint.id}
              position={toAltitudeMarkerPosition(waypoint, waypoint.z)}
              onClick={(event) => {
                event.stopPropagation()

                if (generatedRevealLocked) {
                  return
                }

                onSelectWaypoint(waypoint.id)
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
  orbitControlsRef,
}: {
  stage: MissionStage
  scanAltitude: number
  points: MissionPoint[]
  cameraTarget: Vec2
  draggingPointId: number | null
  patternPickerVisible: boolean
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

    controls.enabled = draggingPointId === null && !patternPickerVisible
    controls.enablePan = stage !== 'drawing' && !patternPickerVisible
    controls.enableRotate = true
    controls.enableZoom = true
    controls.minPolarAngle = DEFAULT_MIN_POLAR_ANGLE
    controls.maxPolarAngle =
      stage === 'drawing' ? DRAWING_MAX_POLAR_ANGLE : DEFAULT_MAX_POLAR_ANGLE
    controls.update()
  }, [draggingPointId, orbitControlsRef, patternPickerVisible, stage])

  useFrame((_, delta) => {
    const controls = orbitControlsRef.current

    if (!controls || !(camera instanceof THREE.PerspectiveCamera)) {
      return
    }

    if (patternPickerVisible || draggingPointId !== null) {
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
  orbitControlsRef,
  onRevealActiveChange,
}: {
  stage: MissionStage
  scanAltitude: number
  points: MissionPoint[]
  waypoints: MissionWaypoint[]
  selectedWaypointId: number | null
  orbitControlsRef: React.RefObject<OrbitControlsHandle | null>
  onRevealActiveChange: (active: boolean) => void
}) {
  const { camera } = useThree()
  const previousStageRef = useRef<MissionStage>(stage)
  const previousSelectedWaypointIdRef = useRef<number | null>(selectedWaypointId)
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
