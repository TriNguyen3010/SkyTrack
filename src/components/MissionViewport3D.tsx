import {
  Billboard,
  Grid,
  Line,
  OrbitControls,
  PerspectiveCamera,
  Text,
} from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
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
type ScenePoint = [number, number, number]

interface MissionViewport3DProps {
  stage: MissionStage
  scanAltitude: number
  points: MissionPoint[]
  coverageSegments: Array<[Vec2, Vec2]>
  waypoints: MissionWaypoint[]
  selectedWaypointId: number | null
  onStartDrawing: () => void
  onAddPoint: (x: number, y: number) => void
  onUpdatePoint: (id: number, x: number, y: number) => void
  onClosePolygon: () => void
  onSelectWaypoint: (id: number | null) => void
}

export function MissionViewport3D({
  stage,
  scanAltitude,
  points,
  coverageSegments,
  waypoints,
  selectedWaypointId,
  onStartDrawing,
  onAddPoint,
  onUpdatePoint,
  onClosePolygon,
  onSelectWaypoint,
}: MissionViewport3DProps) {
  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null)
  const [draggingPointId, setDraggingPointId] = useState<number | null>(null)

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
      <PerspectiveCamera makeDefault position={CAMERA_POSITION} fov={34} />

      <Suspense fallback={null}>
        <MissionWorld
          stage={stage}
          scanAltitude={scanAltitude}
          points={points}
          coverageSegments={coverageSegments}
          waypoints={waypoints}
          selectedWaypointId={selectedWaypointId}
          onStartDrawing={onStartDrawing}
          hoverPoint={hoverPoint}
          draggingPointId={draggingPointId}
          onAddPoint={onAddPoint}
          onUpdatePoint={onUpdatePoint}
          onClosePolygon={onClosePolygon}
          onSelectWaypoint={onSelectWaypoint}
          onHoverPointChange={setHoverPoint}
          onDraggingPointChange={setDraggingPointId}
        />
      </Suspense>

      <OrbitControls
        makeDefault
        enabled={draggingPointId === null}
        enableDamping
        minDistance={120}
        maxDistance={340}
        minPolarAngle={Math.PI / 4.8}
        maxPolarAngle={Math.PI / 2.04}
        target={[cameraTarget.x, stage === 'idle' ? 0 : scanAltitude, cameraTarget.y]}
      />
    </Canvas>
  )
}

interface MissionWorldProps extends MissionViewport3DProps {
  hoverPoint: Vec2 | null
  draggingPointId: number | null
  onHoverPointChange: (point: Vec2 | null) => void
  onDraggingPointChange: (id: number | null) => void
}

function MissionWorld({
  stage,
  scanAltitude,
  points,
  coverageSegments,
  waypoints,
  selectedWaypointId,
  onStartDrawing,
  hoverPoint,
  draggingPointId,
  onAddPoint,
  onUpdatePoint,
  onClosePolygon,
  onSelectWaypoint,
  onHoverPointChange,
  onDraggingPointChange,
}: MissionWorldProps) {
  const { camera, gl } = useThree()

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

    if (isPlaneInteractive && hoverPoint) {
      return [
        ...polyline,
        toAltitudePlanePosition(hoverPoint, scanAltitude, ALTITUDE_LINE_OFFSET),
      ]
    }

    if (stage !== 'drawing' && points.length >= 3) {
      return [
        ...polyline,
        toAltitudePlanePosition(points[0], scanAltitude, ALTITUDE_LINE_OFFSET),
      ]
    }

    return polyline
  }, [hoverPoint, isPlaneInteractive, points, scanAltitude, stage])
  const hoverLinkPoints = useMemo(() => {
    if (!canClosePolygon || !hoverPoint || points.length === 0) {
      return null
    }

    return [
      toAltitudePlanePosition(hoverPoint, scanAltitude, ALTITUDE_LINE_OFFSET),
      toAltitudePlanePosition(points[0], scanAltitude, ALTITUDE_LINE_OFFSET),
    ]
  }, [canClosePolygon, hoverPoint, points, scanAltitude])
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

    onHoverPointChange(clampScenePoint(event.point))
  }

  function handleAltitudePlaneClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()

    if (!isPrimaryClickGesture(event)) {
      return
    }

    if (stage === 'setup') {
      const nextPoint = clampScenePoint(event.point)
      onStartDrawing()
      onAddPoint(nextPoint.x, nextPoint.y)
      return
    }

    if (stage === 'drawing') {
      const nextPoint = clampScenePoint(event.point)
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
      onClosePolygon()
    }
  }

  return (
    <>
      <ambientLight intensity={1.05} />
      <hemisphereLight intensity={0.7} color="#ffffff" groundColor="#8fa0b8" />
      <directionalLight position={[96, 180, 72]} intensity={1.12} />

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

      {polygonShape && stage !== 'drawing' && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, scanAltitude + ALTITUDE_PLANE_FILL_OFFSET, 0]}
        >
          <shapeGeometry args={[polygonShape]} />
          <meshStandardMaterial
            color="#8b5cf6"
            transparent
            opacity={stage === 'generated' ? 0.14 : 0.2}
          />
        </mesh>
      )}

      {(stage === 'drawing' || stage === 'editing') && previewPolylinePoints.length >= 2 && (
        <Line
          points={previewPolylinePoints}
          color="#7c6bff"
          lineWidth={2.2}
          dashed={stage === 'drawing'}
          dashSize={4}
          gapSize={3}
        />
      )}

      {hoverLinkPoints && (
        <Line
          points={hoverLinkPoints}
          color="#7c6bff"
          transparent
          opacity={0.62}
          dashed
          dashSize={3}
          gapSize={3}
        />
      )}

      {stage === 'editing' &&
        coverageSegments.map(([start, end], index) => (
          <Line
            key={`coverage-${index}`}
            points={[
              toAltitudePlanePosition(start, scanAltitude, ALTITUDE_LINE_OFFSET),
              toAltitudePlanePosition(end, scanAltitude, ALTITUDE_LINE_OFFSET),
            ]}
            color="#7c6bff"
            transparent
            opacity={0.84}
            dashed
            dashSize={4}
            gapSize={3}
          />
        ))}

      {stage === 'generated' &&
        waypoints.map((waypoint) => (
          <Line
            key={`stem-${waypoint.id}`}
            points={[
              toGroundSurfacePosition(waypoint),
              toAltitudeMarkerPosition(waypoint, waypoint.z),
            ]}
            color={selectedWaypointId === waypoint.id ? '#6d28d9' : '#8b7cf8'}
            transparent
            opacity={selectedWaypointId === waypoint.id ? 0.9 : 0.25}
          />
        ))}

      {stage === 'generated' && routeLinePoints.length >= 2 && (
        <Line points={routeLinePoints} color="#6d28d9" lineWidth={3.2} />
      )}

      {(stage === 'drawing' || stage === 'editing') &&
        points.map((point, index) => (
          <group
            key={point.id}
            position={toAltitudeMarkerPosition(point, scanAltitude)}
            onPointerDown={(event) => handleVertexPointerDown(event, point.id)}
            onClick={(event) => handleVertexClick(event, index)}
          >
            {index === 0 && canClosePolygon && (
              <mesh
                rotation-x={-Math.PI / 2}
                position={[0, -ALTITUDE_MARKER_LIFT + ALTITUDE_LINE_OFFSET, 0]}
              >
                <ringGeometry args={[4.8, 6.8, 64]} />
                <meshBasicMaterial color="#7c6bff" transparent opacity={0.22} />
              </mesh>
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

      {hoverPoint && isPlaneInteractive && (
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
                  color="#6d28d9"
                  emissive="#6d28d9"
                  emissiveIntensity={isSelected ? 0.32 : 0.22}
                />
              </mesh>

              <Billboard position={[0, 8.6, 0]} follow>
                <mesh>
                  <circleGeometry args={[4.2, 36]} />
                  <meshBasicMaterial color={isSelected ? '#5b21f0' : '#7c6bff'} />
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
