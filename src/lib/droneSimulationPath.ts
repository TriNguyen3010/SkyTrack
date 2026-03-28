import * as THREE from 'three'
import {
  DRONE_SIMULATION_SEGMENT_ACCELERATION_RATIO,
  DRONE_SIMULATION_SEGMENT_DECELERATION_RATIO,
  DRONE_SIMULATION_SHARP_TURN_THRESHOLD_DEG,
  DRONE_SIMULATION_SOFT_TURN_THRESHOLD_DEG,
} from './droneSimulationConstants'
import { getWaypointSimulationPauseMs } from './droneSimulationActions'
import type { Vec3 } from './batteryModels'
import type { MissionWaypoint } from '../store/useMissionStore'

export interface DroneSimulationWaypoint {
  id: number
  x: number
  y: number
  z: number
  pauseMs: number
  actions: MissionWaypoint['actions']
  role: MissionWaypoint['role']
}

export interface DroneSimulationSegment {
  index: number
  fromWaypointId: number
  toWaypointId: number
  start: Vec3
  end: Vec3
  length: number
  cumulativeStart: number
  cumulativeEnd: number
  nextTurnAngleDeg: number
}

export interface DroneSimulationPath {
  waypoints: DroneSimulationWaypoint[]
  segments: DroneSimulationSegment[]
  totalLength: number
  isClosedLoop: boolean
  waypointProgressStops: number[]
}

export interface DroneSimulationSample {
  position: Vec3
  heading: Vec3
  segmentIndex: number
  waypointIndex: number
  progress: number
  distance: number
}

export interface DroneSimulationPathSplit {
  travelled: Vec3[]
  remaining: Vec3[]
}

interface BuildDroneSimulationPathInput {
  waypoints: MissionWaypoint[]
  isClosedLoop: boolean
}

export function buildDroneSimulationPath({
  waypoints,
  isClosedLoop,
}: BuildDroneSimulationPathInput): DroneSimulationPath | null {
  const resolvedWaypoints = resolveDroneSimulationWaypoints(waypoints)

  if (resolvedWaypoints.length < 2) {
    return null
  }

  const segments: DroneSimulationSegment[] = []
  const rawSegments = buildRawSegments(resolvedWaypoints, isClosedLoop)

  if (rawSegments.length === 0) {
    return null
  }

  let totalLength = 0

  rawSegments.forEach((segment, index) => {
    const nextTurnAngleDeg = getNextTurnAngleDeg(rawSegments, index, isClosedLoop)
    segments.push({
      index,
      fromWaypointId: segment.fromWaypointId,
      toWaypointId: segment.toWaypointId,
      start: segment.start,
      end: segment.end,
      length: segment.length,
      cumulativeStart: totalLength,
      cumulativeEnd: totalLength + segment.length,
      nextTurnAngleDeg,
    })
    totalLength += segment.length
  })

  const waypointProgressStops = resolvedWaypoints.map((_, index) =>
    getWaypointDistanceAlongPath({
      segments,
      waypointIndex: index,
      waypointCount: resolvedWaypoints.length,
      isClosedLoop,
      totalLength,
    }) / totalLength,
  )

  return {
    waypoints: resolvedWaypoints,
    segments,
    totalLength,
    isClosedLoop,
    waypointProgressStops,
  }
}

export function resolveDroneSimulationWaypoints(
  waypoints: MissionWaypoint[],
): DroneSimulationWaypoint[] {
  let altitudeOffset = 0

  return waypoints.map((waypoint) => {
    const resolvedWaypoint: DroneSimulationWaypoint = {
      id: waypoint.id,
      x: waypoint.x,
      y: waypoint.y,
      z: Math.max(0, waypoint.z + altitudeOffset),
      pauseMs: getWaypointSimulationPauseMs(waypoint),
      actions: waypoint.actions,
      role: waypoint.role,
    }
    altitudeOffset += getWaypointAltitudeDelta(waypoint)
    return resolvedWaypoint
  })
}

export function sampleDroneSimulationPath(
  path: DroneSimulationPath,
  progress: number,
): DroneSimulationSample {
  if (path.segments.length === 0 || path.totalLength <= 0) {
    const fallbackWaypoint = path.waypoints[0]
    return {
      position: toVec3(fallbackWaypoint),
      heading: { x: 1, y: 0, z: 0 },
      segmentIndex: 0,
      waypointIndex: 0,
      progress: 0,
      distance: 0,
    }
  }

  const normalizedProgress = normalizeDroneSimulationProgress(
    progress,
    path.isClosedLoop,
  )
  const distance = normalizedProgress * path.totalLength
  const segment = getSegmentAtDistance(path.segments, distance)
  const segmentDistance = distance - segment.cumulativeStart
  const rawT = segment.length === 0 ? 1 : segmentDistance / segment.length
  const easedT = applySegmentSpeedProfile(rawT, segment.nextTurnAngleDeg)
  const start = toThreeVector(segment.start)
  const end = toThreeVector(segment.end)
  const position = start.clone().lerp(end, easedT)
  const lookAheadProgress = normalizeDroneSimulationProgress(
    normalizedProgress + 0.0025,
    path.isClosedLoop,
  )
  const lookAheadDistance = lookAheadProgress * path.totalLength
  const lookAheadSegment = getSegmentAtDistance(path.segments, lookAheadDistance)
  const lookAheadT =
    lookAheadSegment.length === 0
      ? 1
      : (lookAheadDistance - lookAheadSegment.cumulativeStart) /
        lookAheadSegment.length
  const lookAheadPosition = toThreeVector(lookAheadSegment.start).lerp(
    toThreeVector(lookAheadSegment.end),
    applySegmentSpeedProfile(lookAheadT, lookAheadSegment.nextTurnAngleDeg),
  )
  const heading = lookAheadPosition.sub(position).normalize()

  return {
    position: fromThreeVector(position),
    heading:
      heading.lengthSq() > 0
        ? fromThreeVector(heading)
        : getSegmentHeading(segment.start, segment.end),
    segmentIndex: segment.index,
    waypointIndex: getWaypointIndexForSegment(path, segment.index),
    progress: normalizedProgress,
    distance,
  }
}

export function normalizeDroneSimulationProgress(
  progress: number,
  isClosedLoop: boolean,
): number {
  if (!Number.isFinite(progress)) {
    return 0
  }

  if (isClosedLoop) {
    const wrapped = progress % 1
    return wrapped < 0 ? wrapped + 1 : wrapped
  }

  return Math.min(1, Math.max(0, progress))
}

export function getDroneSimulationWaypointIndexAtProgress(
  path: DroneSimulationPath,
  progress: number,
): number {
  const normalized = normalizeDroneSimulationProgress(progress, path.isClosedLoop)

  for (let index = path.waypointProgressStops.length - 1; index >= 0; index -= 1) {
    if (normalized >= path.waypointProgressStops[index]) {
      return index
    }
  }

  return 0
}

export function getDroneSimulationWaypointProgress(
  path: DroneSimulationPath,
  waypointIndex: number,
): number {
  if (waypointIndex <= 0) {
    return 0
  }

  return (
    path.waypointProgressStops[
      Math.min(waypointIndex, path.waypointProgressStops.length - 1)
    ] ?? 0
  )
}

export function getDroneSimulationPathSplit(
  path: DroneSimulationPath,
  progress: number,
): DroneSimulationPathSplit {
  const sample = sampleDroneSimulationPath(path, progress)
  const segment = path.segments[sample.segmentIndex]
  const currentPosition = sample.position
  const travelled: Vec3[] = [segment.start]
  const remaining: Vec3[] = [currentPosition]

  for (let index = 0; index < sample.segmentIndex; index += 1) {
    travelled.push(path.segments[index].end)
  }

  travelled.push(currentPosition)

  for (let index = sample.segmentIndex; index < path.segments.length; index += 1) {
    remaining.push(path.segments[index].end)
  }

  return {
    travelled: dedupeVec3Path(travelled),
    remaining: dedupeVec3Path(remaining),
  }
}

export function applySegmentSpeedProfile(
  progress: number,
  turnAngleDeg: number,
): number {
  const clamped = Math.min(1, Math.max(0, progress))
  const decelerationWeight =
    turnAngleDeg <= DRONE_SIMULATION_SOFT_TURN_THRESHOLD_DEG
      ? 0
      : turnAngleDeg >= DRONE_SIMULATION_SHARP_TURN_THRESHOLD_DEG
        ? 1
        : (turnAngleDeg - DRONE_SIMULATION_SOFT_TURN_THRESHOLD_DEG) /
          (DRONE_SIMULATION_SHARP_TURN_THRESHOLD_DEG -
            DRONE_SIMULATION_SOFT_TURN_THRESHOLD_DEG)

  const accelerationZone = DRONE_SIMULATION_SEGMENT_ACCELERATION_RATIO
  const decelerationZone =
    DRONE_SIMULATION_SEGMENT_DECELERATION_RATIO * (1 + decelerationWeight * 0.55)

  if (clamped < accelerationZone) {
    const local = clamped / accelerationZone
    return local * local * accelerationZone
  }

  if (clamped > 1 - decelerationZone) {
    const local = (clamped - (1 - decelerationZone)) / decelerationZone
    const exponent = 1.35 + decelerationWeight * 1.55
    return 1 - decelerationZone + Math.pow(local, exponent) * decelerationZone
  }

  const cruiseStart = accelerationZone
  const cruiseEnd = 1 - decelerationZone
  const cruiseProgress = (clamped - cruiseStart) / Math.max(cruiseEnd - cruiseStart, 0.0001)

  return accelerationZone + cruiseProgress * Math.max(cruiseEnd - cruiseStart, 0)
}

function buildRawSegments(
  waypoints: DroneSimulationWaypoint[],
  isClosedLoop: boolean,
): Array<{
  fromWaypointId: number
  toWaypointId: number
  start: Vec3
  end: Vec3
  length: number
}> {
  const segments: Array<{
    fromWaypointId: number
    toWaypointId: number
    start: Vec3
    end: Vec3
    length: number
  }> = []

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const start = toVec3(waypoints[index])
    const end = toVec3(waypoints[index + 1])
    segments.push({
      fromWaypointId: waypoints[index].id,
      toWaypointId: waypoints[index + 1].id,
      start,
      end,
      length: getDistance(start, end),
    })
  }

  if (isClosedLoop && waypoints.length > 2) {
    const start = toVec3(waypoints[waypoints.length - 1])
    const end = toVec3(waypoints[0])
    segments.push({
      fromWaypointId: waypoints[waypoints.length - 1].id,
      toWaypointId: waypoints[0].id,
      start,
      end,
      length: getDistance(start, end),
    })
  }

  return segments.filter((segment) => segment.length > 0)
}

function getNextTurnAngleDeg(
  segments: Array<{ start: Vec3; end: Vec3 }>,
  index: number,
  isClosedLoop: boolean,
): number {
  const current = segments[index]
  const next = segments[index + 1] ?? (isClosedLoop ? segments[0] : null)

  if (!current || !next) {
    return 0
  }

  const currentHeading = toThreeVector(current.end).sub(toThreeVector(current.start)).normalize()
  const nextHeading = toThreeVector(next.end).sub(toThreeVector(next.start)).normalize()
  const angle = currentHeading.angleTo(nextHeading)
  return THREE.MathUtils.radToDeg(angle)
}

function getSegmentAtDistance(
  segments: DroneSimulationSegment[],
  distance: number,
): DroneSimulationSegment {
  for (const segment of segments) {
    if (distance <= segment.cumulativeEnd) {
      return segment
    }
  }

  return segments[segments.length - 1]
}

function getWaypointIndexForSegment(
  path: DroneSimulationPath,
  segmentIndex: number,
): number {
  return Math.min(segmentIndex, path.waypoints.length - 1)
}

function getWaypointDistanceAlongPath({
  segments,
  waypointIndex,
  waypointCount,
  isClosedLoop,
  totalLength,
}: {
  segments: DroneSimulationSegment[]
  waypointIndex: number
  waypointCount: number
  isClosedLoop: boolean
  totalLength: number
}): number {
  if (waypointIndex <= 0) {
    return 0
  }

  if (waypointIndex >= waypointCount - 1 && isClosedLoop) {
    return totalLength
  }

  const segment = segments[waypointIndex - 1]
  return segment?.cumulativeEnd ?? totalLength
}

function getWaypointAltitudeDelta(waypoint: MissionWaypoint): number {
  return waypoint.actions.reduce((sum, action) => {
    if (action.type !== 'change_altitude') {
      return sum
    }
    return sum + action.config.altitudeDelta
  }, 0)
}

function dedupeVec3Path(points: Vec3[]): Vec3[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]

    if (!previous) {
      return true
    }

    return (
      Math.abs(previous.x - point.x) > 0.001 ||
      Math.abs(previous.y - point.y) > 0.001 ||
      Math.abs(previous.z - point.z) > 0.001
    )
  })
}

function getDistance(start: Vec3, end: Vec3): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const dz = end.z - start.z
  return Math.hypot(dx, dy, dz)
}

function getSegmentHeading(start: Vec3, end: Vec3): Vec3 {
  const direction = toThreeVector(end).sub(toThreeVector(start)).normalize()

  return direction.lengthSq() > 0 ? fromThreeVector(direction) : { x: 1, y: 0, z: 0 }
}

function toVec3(point: { x: number; y: number; z: number }): Vec3 {
  return {
    x: point.x,
    y: point.z,
    z: point.y,
  }
}

function toThreeVector(point: Vec3): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z)
}

function fromThreeVector(vector: THREE.Vector3): Vec3 {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  }
}
