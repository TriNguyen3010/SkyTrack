import type { MissionPoint, ExclusionZone } from '../store/useMissionStore'

export interface Vec2Like {
  x: number
  y: number
}

export interface Bounds2D {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const EPSILON = 0.0001

export function getPolygonBounds(points: Vec2Like[]): Bounds2D {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

export function getSegmentBounds(
  segment: readonly [Vec2Like, Vec2Like],
): Bounds2D {
  return {
    minX: Math.min(segment[0].x, segment[1].x),
    maxX: Math.max(segment[0].x, segment[1].x),
    minY: Math.min(segment[0].y, segment[1].y),
    maxY: Math.max(segment[0].y, segment[1].y),
  }
}

export function boundsOverlap(left: Bounds2D, right: Bounds2D): boolean {
  return !(
    left.maxX < right.minX - EPSILON ||
    left.minX > right.maxX + EPSILON ||
    left.maxY < right.minY - EPSILON ||
    left.minY > right.maxY + EPSILON
  )
}

export function lerpVec2(start: Vec2Like, end: Vec2Like, amount: number) {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  }
}

export function distance2D(left: Vec2Like, right: Vec2Like): number {
  const dx = right.x - left.x
  const dy = right.y - left.y

  return Math.sqrt(dx * dx + dy * dy)
}

export function isPointOnSegment(
  point: Vec2Like,
  start: Vec2Like,
  end: Vec2Like,
): boolean {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y)

  if (Math.abs(cross) > EPSILON) {
    return false
  }

  const dot =
    (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y)

  if (dot < -EPSILON) {
    return false
  }

  const squaredLength =
    (end.x - start.x) * (end.x - start.x) +
    (end.y - start.y) * (end.y - start.y)

  if (dot - squaredLength > EPSILON) {
    return false
  }

  return true
}

export function isPointInPolygon(
  point: Vec2Like,
  polygon: Array<Pick<MissionPoint, 'x' | 'y'>>,
): boolean {
  if (polygon.length < 3) {
    return false
  }

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]

    if (isPointOnSegment(point, start, end)) {
      return false
    }
  }

  let inside = false

  for (
    let leftIndex = 0, rightIndex = polygon.length - 1;
    leftIndex < polygon.length;
    rightIndex = leftIndex, leftIndex += 1
  ) {
    const left = polygon[leftIndex]
    const right = polygon[rightIndex]
    const intersects =
      left.y > point.y !== right.y > point.y &&
      point.x <
        ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

export function isPointInAnyExclusion(
  point: Vec2Like,
  zones: ExclusionZone[],
): boolean {
  return zones.some(
    (zone) =>
      zone.enabled &&
      zone.points.length >= 3 &&
      isPointInPolygon(point, zone.points),
  )
}

export function findSegmentPolygonIntersections(
  start: Vec2Like,
  end: Vec2Like,
  polygon: MissionPoint[],
): Array<{ t: number; point: { x: number; y: number } }> {
  const intersections: Array<{ t: number; point: { x: number; y: number } }> = []

  for (let index = 0; index < polygon.length; index += 1) {
    const edgeStart = polygon[index]
    const edgeEnd = polygon[(index + 1) % polygon.length]
    const intersection = getSegmentIntersection(start, end, edgeStart, edgeEnd)

    if (!intersection) {
      continue
    }

    const alreadyPresent = intersections.some(
      (entry) =>
        Math.abs(entry.t - intersection.t) < EPSILON ||
        distance2D(entry.point, intersection.point) < EPSILON,
    )

    if (!alreadyPresent) {
      intersections.push(intersection)
    }
  }

  intersections.sort((left, right) => left.t - right.t)

  return intersections
}

export function clipSegmentAgainstPolygon(
  segment: readonly [Vec2Like, Vec2Like],
  polygon: MissionPoint[],
): Array<[Vec2Like, Vec2Like]> {
  if (polygon.length < 3) {
    return [[segment[0], segment[1]]]
  }

  const segmentBounds = getSegmentBounds(segment)
  const polygonBounds = getPolygonBounds(polygon)

  if (!boundsOverlap(segmentBounds, polygonBounds)) {
    return [[segment[0], segment[1]]]
  }

  const [start, end] = segment
  const intersections = findSegmentPolygonIntersections(start, end, polygon)

  if (intersections.length === 0) {
    const midpoint = lerpVec2(start, end, 0.5)

    return isPointInPolygon(midpoint, polygon) ? [] : [[start, end]]
  }

  const breakpoints = [
    { t: 0, point: { x: start.x, y: start.y } },
    ...intersections,
    { t: 1, point: { x: end.x, y: end.y } },
  ]
  const result: Array<[Vec2Like, Vec2Like]> = []

  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const current = breakpoints[index]
    const next = breakpoints[index + 1]
    const midpoint = lerpVec2(start, end, (current.t + next.t) / 2)

    if (isPointInPolygon(midpoint, polygon)) {
      continue
    }

    if (distance2D(current.point, next.point) <= EPSILON) {
      continue
    }

    result.push([current.point, next.point])
  }

  return mergeConnectedCollinearSegments(result)
}

export function clipSegmentsAgainstExclusions(
  segments: Array<[Vec2Like, Vec2Like]>,
  exclusionZones: ExclusionZone[],
): Array<[Vec2Like, Vec2Like]> {
  const activeZones = exclusionZones.filter(
    (zone) => zone.enabled && zone.points.length >= 3,
  )

  if (activeZones.length === 0) {
    return segments.map(([start, end]) => [
      { x: start.x, y: start.y },
      { x: end.x, y: end.y },
    ])
  }

  let result = segments.map(([start, end]) => [
    { x: start.x, y: start.y },
    { x: end.x, y: end.y },
  ]) as Array<[Vec2Like, Vec2Like]>

  for (const zone of activeZones) {
    const zoneBounds = getPolygonBounds(zone.points)
    result = result.flatMap((segment) => {
      if (!boundsOverlap(getSegmentBounds(segment), zoneBounds)) {
        return [segment]
      }

      return clipSegmentAgainstPolygon(segment, zone.points)
    })
  }

  return result
}

function getSegmentIntersection(
  startA: Vec2Like,
  endA: Vec2Like,
  startB: Vec2Like,
  endB: Vec2Like,
): { t: number; point: { x: number; y: number } } | null {
  const dxA = endA.x - startA.x
  const dyA = endA.y - startA.y
  const dxB = endB.x - startB.x
  const dyB = endB.y - startB.y
  const denominator = dxA * dyB - dyA * dxB

  if (Math.abs(denominator) < EPSILON) {
    return null
  }

  const diffX = startB.x - startA.x
  const diffY = startB.y - startA.y
  const t = (diffX * dyB - diffY * dxB) / denominator
  const u = (diffX * dyA - diffY * dxA) / denominator

  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) {
    return null
  }

  const clampedT = Math.min(1, Math.max(0, t))

  return {
    t: clampedT,
    point: {
      x: startA.x + dxA * clampedT,
      y: startA.y + dyA * clampedT,
    },
  }
}

function mergeConnectedCollinearSegments(
  segments: Array<[Vec2Like, Vec2Like]>,
): Array<[Vec2Like, Vec2Like]> {
  if (segments.length <= 1) {
    return segments
  }

  const merged: Array<[Vec2Like, Vec2Like]> = [segments[0]]

  for (let index = 1; index < segments.length; index += 1) {
    const previous = merged[merged.length - 1]
    const current = segments[index]

    if (
      distance2D(previous[1], current[0]) < EPSILON &&
      areCollinear(previous[0], previous[1], current[1])
    ) {
      merged[merged.length - 1] = [previous[0], current[1]]
      continue
    }

    merged.push(current)
  }

  return merged
}

function areCollinear(left: Vec2Like, middle: Vec2Like, right: Vec2Like): boolean {
  const area =
    (middle.x - left.x) * (right.y - left.y) -
    (middle.y - left.y) * (right.x - left.x)

  return Math.abs(area) < EPSILON
}
