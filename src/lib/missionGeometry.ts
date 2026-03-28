import type { MissionPoint, MissionWaypoint } from '../store/useMissionStore'

export interface Vec2 {
  x: number
  y: number
}

type PointLike = Pick<MissionPoint, 'x' | 'y'>

export interface PlaneGeometry {
  origin: Vec2
  u: Vec2
  v: Vec2
  corners: [Vec2, Vec2, Vec2, Vec2]
}

export interface ScreenToWorldResult {
  point: Vec2
  inside: boolean
}

export const WORLD_BOUNDS = {
  minX: -120,
  maxX: 120,
  minY: -90,
  maxY: 90,
}

const worldWidth = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX
const worldHeight = WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY
const GEOMETRY_EPSILON = 0.0001

export const WORLD_DIMENSIONS = {
  width: worldWidth,
  height: worldHeight,
}

function makePlane(origin: Vec2, u: Vec2, v: Vec2): PlaneGeometry {
  return {
    origin,
    u,
    v,
    corners: [
      origin,
      { x: origin.x + u.x, y: origin.y + u.y },
      { x: origin.x + u.x + v.x, y: origin.y + u.y + v.y },
      { x: origin.x + v.x, y: origin.y + v.y },
    ],
  }
}

export function getMissionPlane(width: number, height: number): PlaneGeometry {
  return makePlane(
    { x: width * 0.24, y: height * 0.16 },
    { x: width * 0.56, y: height * 0.09 },
    { x: -width * 0.28, y: height * 0.56 },
  )
}

export function getGroundPlane(width: number, height: number): PlaneGeometry {
  return makePlane(
    { x: width * 0.15, y: height * 0.34 },
    { x: width * 0.62, y: height * 0.11 },
    { x: -width * 0.36, y: height * 0.52 },
  )
}

export function getGridLines(
  plane: PlaneGeometry,
  divisions: number,
): Array<[Vec2, Vec2]> {
  const lines: Array<[Vec2, Vec2]> = []

  for (let index = 1; index < divisions; index += 1) {
    const ratio = index / divisions

    lines.push([
      lerpPoint(plane.origin, addPoints(plane.origin, plane.v), ratio),
      lerpPoint(
        addPoints(plane.origin, plane.u),
        addPoints(addPoints(plane.origin, plane.u), plane.v),
        ratio,
      ),
    ])

    lines.push([
      lerpPoint(plane.origin, addPoints(plane.origin, plane.u), ratio),
      lerpPoint(
        addPoints(plane.origin, plane.v),
        addPoints(addPoints(plane.origin, plane.v), plane.u),
        ratio,
      ),
    ])
  }

  return lines
}

export function worldToScreen(
  point: Pick<MissionPoint, 'x' | 'y'>,
  plane: PlaneGeometry,
): Vec2 {
  const u = (point.x - WORLD_BOUNDS.minX) / worldWidth
  const v = (WORLD_BOUNDS.maxY - point.y) / worldHeight

  return {
    x: plane.origin.x + plane.u.x * u + plane.v.x * v,
    y: plane.origin.y + plane.u.y * u + plane.v.y * v,
  }
}

export function screenToWorld(
  point: Vec2,
  plane: PlaneGeometry,
): ScreenToWorldResult {
  const dx = point.x - plane.origin.x
  const dy = point.y - plane.origin.y
  const det = plane.u.x * plane.v.y - plane.u.y * plane.v.x

  if (Math.abs(det) < 0.0001) {
    return {
      point: { x: 0, y: 0 },
      inside: false,
    }
  }

  const u = (dx * plane.v.y - dy * plane.v.x) / det
  const v = (dy * plane.u.x - dx * plane.u.y) / det

  return {
    point: {
      x: WORLD_BOUNDS.minX + u * worldWidth,
      y: WORLD_BOUNDS.maxY - v * worldHeight,
    },
    inside: u >= 0 && u <= 1 && v >= 0 && v <= 1,
  }
}

export function clampWorldPoint(point: Vec2): Vec2 {
  return {
    x: Math.min(WORLD_BOUNDS.maxX, Math.max(WORLD_BOUNDS.minX, point.x)),
    y: Math.min(WORLD_BOUNDS.maxY, Math.max(WORLD_BOUNDS.minY, point.y)),
  }
}

export function polygonArea(points: Array<Pick<MissionPoint, 'x' | 'y'>>): number {
  if (points.length < 3) {
    return 0
  }

  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return Math.abs(area / 2)
}

export function polygonCentroid(
  points: Array<Pick<MissionPoint, 'x' | 'y'>>,
): Vec2 {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }

  const summed = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: summed.x / points.length,
    y: summed.y / points.length,
  }
}

export function generateCoverageSegments(
  points: Array<Pick<MissionPoint, 'x' | 'y'>>,
  spacing: number,
  angleDegrees: number,
): Array<[Vec2, Vec2]> {
  if (points.length < 3) {
    return []
  }

  const center = polygonCentroid(points)
  const rotated = points.map((point) => rotatePoint(point, center, -angleDegrees))
  const ys = rotated.map((point) => point.y)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const segments: Array<[Vec2, Vec2]> = []

  for (let y = minY + spacing / 2; y < maxY; y += spacing) {
    const intersections: number[] = []

    for (let index = 0; index < rotated.length; index += 1) {
      const current = rotated[index]
      const next = rotated[(index + 1) % rotated.length]
      const lowY = Math.min(current.y, next.y)
      const highY = Math.max(current.y, next.y)

      if (lowY === highY || y < lowY || y >= highY) {
        continue
      }

      const ratio = (y - current.y) / (next.y - current.y)
      intersections.push(current.x + (next.x - current.x) * ratio)
    }

    intersections.sort((left, right) => left - right)

    for (let index = 0; index < intersections.length - 1; index += 2) {
      const start = rotatePoint({ x: intersections[index], y }, center, angleDegrees)
      const end = rotatePoint(
        { x: intersections[index + 1], y },
        center,
        angleDegrees,
      )

      segments.push([start, end])
    }
  }

  return segments
}

export function canAppendPointToOpenPath(
  points: PointLike[],
  nextPoint: PointLike,
): boolean {
  if (points.some((point) => pointsEqual(point, nextPoint))) {
    return false
  }

  const candidate = [...points, nextPoint]

  return !hasOpenPathSelfIntersection(candidate)
}

export function isSimplePolygon(points: PointLike[]): boolean {
  if (points.length < 3 || polygonArea(points) < GEOMETRY_EPSILON) {
    return false
  }

  if (hasDuplicatePoints(points)) {
    return false
  }

  const segments = points.map((point, index) => [
    point,
    points[(index + 1) % points.length],
  ] as const)

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < segments.length;
      rightIndex += 1
    ) {
      if (areClosedSegmentsAdjacent(leftIndex, rightIndex, segments.length)) {
        continue
      }

      const [leftStart, leftEnd] = segments[leftIndex]
      const [rightStart, rightEnd] = segments[rightIndex]

      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return false
      }
    }
  }

  return true
}

export function generateCoverageWaypoints(
  segments: Array<[Vec2, Vec2]>,
  altitude: number,
): MissionWaypoint[] {
  const waypoints: MissionWaypoint[] = []

  segments.forEach(([start, end], index) => {
    const orderedSegment = index % 2 === 0 ? [start, end] : [end, start]

    orderedSegment.forEach((point) => {
      waypoints.push({
        id: waypoints.length + 1,
        x: Math.round(point.x * 100) / 100,
        y: Math.round(point.y * 100) / 100,
        z: altitude,
        actions: [],
        role: 'anchor',
      })
    })
  })

  return waypoints
}

function addPoints(left: Vec2, right: Vec2): Vec2 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  }
}

function lerpPoint(start: Vec2, end: Vec2, amount: number): Vec2 {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  }
}

function rotatePoint(
  point: Pick<MissionPoint, 'x' | 'y'>,
  center: Vec2,
  angleDegrees: number,
): Vec2 {
  const radians = (angleDegrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const translatedX = point.x - center.x
  const translatedY = point.y - center.y

  return {
    x: center.x + translatedX * cos - translatedY * sin,
    y: center.y + translatedX * sin + translatedY * cos,
  }
}

function hasOpenPathSelfIntersection(points: PointLike[]): boolean {
  if (points.length < 4) {
    return false
  }

  const segments = points.slice(1).map((point, index) => [
    points[index],
    point,
  ] as const)

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < segments.length;
      rightIndex += 1
    ) {
      if (Math.abs(leftIndex - rightIndex) <= 1) {
        continue
      }

      const [leftStart, leftEnd] = segments[leftIndex]
      const [rightStart, rightEnd] = segments[rightIndex]

      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) {
        return true
      }
    }
  }

  return false
}

function hasDuplicatePoints(points: PointLike[]): boolean {
  for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < points.length;
      rightIndex += 1
    ) {
      if (pointsEqual(points[leftIndex], points[rightIndex])) {
        return true
      }
    }
  }

  return false
}

function areClosedSegmentsAdjacent(
  leftIndex: number,
  rightIndex: number,
  segmentCount: number,
): boolean {
  return (
    Math.abs(leftIndex - rightIndex) === 1 ||
    (leftIndex === 0 && rightIndex === segmentCount - 1)
  )
}

function segmentsIntersect(
  firstStart: PointLike,
  firstEnd: PointLike,
  secondStart: PointLike,
  secondEnd: PointLike,
): boolean {
  const firstOrientationA = orientation(firstStart, firstEnd, secondStart)
  const firstOrientationB = orientation(firstStart, firstEnd, secondEnd)
  const secondOrientationA = orientation(secondStart, secondEnd, firstStart)
  const secondOrientationB = orientation(secondStart, secondEnd, firstEnd)

  if (
    firstOrientationA !== firstOrientationB &&
    secondOrientationA !== secondOrientationB
  ) {
    return true
  }

  if (
    firstOrientationA === 0 &&
    isPointOnSegment(secondStart, firstStart, firstEnd)
  ) {
    return true
  }

  if (
    firstOrientationB === 0 &&
    isPointOnSegment(secondEnd, firstStart, firstEnd)
  ) {
    return true
  }

  if (
    secondOrientationA === 0 &&
    isPointOnSegment(firstStart, secondStart, secondEnd)
  ) {
    return true
  }

  if (
    secondOrientationB === 0 &&
    isPointOnSegment(firstEnd, secondStart, secondEnd)
  ) {
    return true
  }

  return false
}

function orientation(first: PointLike, second: PointLike, third: PointLike): number {
  const value =
    (second.y - first.y) * (third.x - second.x) -
    (second.x - first.x) * (third.y - second.y)

  if (Math.abs(value) < GEOMETRY_EPSILON) {
    return 0
  }

  return value > 0 ? 1 : 2
}

function isPointOnSegment(
  point: PointLike,
  start: PointLike,
  end: PointLike,
): boolean {
  return (
    point.x <= Math.max(start.x, end.x) + GEOMETRY_EPSILON &&
    point.x + GEOMETRY_EPSILON >= Math.min(start.x, end.x) &&
    point.y <= Math.max(start.y, end.y) + GEOMETRY_EPSILON &&
    point.y + GEOMETRY_EPSILON >= Math.min(start.y, end.y)
  )
}

function pointsEqual(left: PointLike, right: PointLike): boolean {
  return (
    Math.abs(left.x - right.x) < GEOMETRY_EPSILON &&
    Math.abs(left.y - right.y) < GEOMETRY_EPSILON
  )
}
