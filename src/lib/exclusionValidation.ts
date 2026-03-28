import {
  boundsOverlap,
  findSegmentPolygonIntersections,
  getPolygonBounds,
  isPointInPolygon,
} from './exclusionGeometry'
import {
  isSimplePolygon,
  polygonArea,
} from './missionGeometry'
import type { ExclusionZone, MissionPoint } from '../store/useMissionStore'

export type ExclusionValidationCode =
  | 'too-few-points'
  | 'self-intersection'
  | 'outside-boundary'
  | 'partially-outside-boundary'
  | 'overlaps-zone'
  | 'too-small'
  | 'fully-covers-boundary'

export interface ExclusionValidationIssue {
  code: ExclusionValidationCode
  level: 'warning' | 'error'
  message: string
  relatedZoneId?: number
}

export function getExclusionZoneValidationIssues({
  zone,
  boundaryPoints,
  otherZones = [],
  lineSpacing,
}: {
  zone: Pick<ExclusionZone, 'id' | 'label' | 'points'>
  boundaryPoints: MissionPoint[]
  otherZones?: ExclusionZone[]
  lineSpacing?: number
}): ExclusionValidationIssue[] {
  const issues: ExclusionValidationIssue[] = []
  const area = polygonArea(zone.points)

  if (zone.points.length < 3) {
    issues.push({
      code: 'too-few-points',
      level: 'error',
      message: 'Excluded area needs at least 3 points before it can be closed.',
    })

    return issues
  }

  if (!isSimplePolygon(zone.points)) {
    issues.push({
      code: 'self-intersection',
      level: 'error',
      message: 'Excluded area must be a simple non-crossing polygon.',
    })
  }

  const placement = getPolygonPlacementAgainstBoundary(zone.points, boundaryPoints)

  if (placement === 'outside') {
    issues.push({
      code: 'outside-boundary',
      level: 'warning',
      message: 'Excluded area is outside the mission boundary and will not affect the path.',
    })
  } else if (placement === 'partial') {
    issues.push({
      code: 'partially-outside-boundary',
      level: 'warning',
      message: 'Excluded area extends beyond the mission boundary and may be partially ignored.',
    })
  }

  const overlappingZone = otherZones.find(
    (otherZone) =>
      otherZone.id !== zone.id &&
      otherZone.points.length >= 3 &&
      polygonsOverlap(zone.points, otherZone.points),
  )

  if (overlappingZone) {
    issues.push({
      code: 'overlaps-zone',
      level: 'warning',
      relatedZoneId: overlappingZone.id,
      message: `Excluded area overlaps ${overlappingZone.label}.`,
    })
  }

  if (lineSpacing && area > 0 && area < lineSpacing * lineSpacing) {
    issues.push({
      code: 'too-small',
      level: 'warning',
      message: 'Excluded area is smaller than the current scan spacing and may have little effect.',
    })
  }

  if (
    boundaryPoints.length >= 3 &&
    area >= polygonArea(boundaryPoints) - 0.001 &&
    zone.points.every((point) => isPointInPolygon(point, boundaryPoints))
  ) {
    issues.push({
      code: 'fully-covers-boundary',
      level: 'error',
      message: 'Excluded area covers the entire mission boundary. No route can be generated.',
    })
  }

  return issues
}

export function getEnabledExclusionZones(
  zones: ExclusionZone[],
): ExclusionZone[] {
  return zones.filter((zone) => zone.enabled && zone.points.length >= 3)
}

export function getPolygonPlacementAgainstBoundary(
  polygon: MissionPoint[],
  boundaryPoints: MissionPoint[],
): 'inside' | 'partial' | 'outside' {
  if (polygon.length < 3 || boundaryPoints.length < 3) {
    return 'outside'
  }

  const insideCount = polygon.filter((point) =>
    isPointInPolygon(point, boundaryPoints),
  ).length

  if (insideCount === polygon.length) {
    return 'inside'
  }

  const polygonBounds = getPolygonBounds(polygon)
  const boundaryBounds = getPolygonBounds(boundaryPoints)

  if (!boundsOverlap(polygonBounds, boundaryBounds)) {
    return 'outside'
  }

  if (insideCount > 0) {
    return 'partial'
  }

  const centroid = {
    x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
    y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
  }

  if (isPointInPolygon(centroid, boundaryPoints)) {
    return 'partial'
  }

  return 'outside'
}

export function polygonsOverlap(
  left: MissionPoint[],
  right: MissionPoint[],
): boolean {
  if (left.length < 3 || right.length < 3) {
    return false
  }

  if (!boundsOverlap(getPolygonBounds(left), getPolygonBounds(right))) {
    return false
  }

  return (
    left.some((point) => isPointInPolygon(point, right)) ||
    right.some((point) => isPointInPolygon(point, left)) ||
    polygonEdgesIntersect(left, right)
  )
}

function polygonEdgesIntersect(left: MissionPoint[], right: MissionPoint[]): boolean {
  for (let index = 0; index < left.length; index += 1) {
    const segment = [left[index], left[(index + 1) % left.length]] as const

    if (findSegmentPolygonIntersections(segment[0], segment[1], right).length > 0) {
      return true
    }
  }

  return false
}
