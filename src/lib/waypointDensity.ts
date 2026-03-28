import type { MissionWaypoint } from '../store/useMissionStore'
import type {
  PathSegment,
  WaypointDensityConfig,
  WaypointDensityConstraints,
  WaypointDensityMetrics,
} from './waypointDensityModels'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function distance2D(
  left: Pick<MissionWaypoint, 'x' | 'y'>,
  right: Pick<MissionWaypoint, 'x' | 'y'>,
): number {
  const dx = right.x - left.x
  const dy = right.y - left.y

  return Math.sqrt(dx * dx + dy * dy)
}

function isCountMode(config: WaypointDensityConfig): boolean {
  return config.mode === 'count' && config.targetCount !== null
}

function isSpacingMode(config: WaypointDensityConfig): boolean {
  return config.mode === 'spacing' && config.targetSpacing !== null
}

export function buildPathSegmentsFromAnchors(
  anchors: MissionWaypoint[],
): PathSegment[] {
  const segments: PathSegment[] = []

  for (let index = 1; index < anchors.length; index += 1) {
    const previousAnchor = anchors[index - 1]
    const nextAnchor = anchors[index]
    const length = distance2D(previousAnchor, nextAnchor)
    const direction =
      length > 0
        ? {
            x: (nextAnchor.x - previousAnchor.x) / length,
            y: (nextAnchor.y - previousAnchor.y) / length,
          }
        : { x: 0, y: 0 }

    segments.push({
      fromAnchorId: previousAnchor.id,
      toAnchorId: nextAnchor.id,
      length: round2(length),
      direction,
    })
  }

  return segments
}

function allocateIntermediateCountsByTarget(
  segments: PathSegment[],
  totalIntermediateCount: number,
): number[] {
  if (segments.length === 0 || totalIntermediateCount <= 0) {
    return segments.map(() => 0)
  }

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)

  if (totalLength <= 0) {
    return segments.map(() => 0)
  }

  const baseCounts = segments.map((segment) =>
    Math.floor((segment.length / totalLength) * totalIntermediateCount),
  )
  const assigned = baseCounts.reduce((sum, count) => sum + count, 0)
  let remainder = totalIntermediateCount - assigned

  if (remainder <= 0) {
    return baseCounts
  }

  const rankedSegments = segments
    .map((segment, index) => ({
      index,
      fraction:
        (segment.length / totalLength) * totalIntermediateCount - baseCounts[index],
      length: segment.length,
    }))
    .sort((left, right) => {
      if (right.fraction !== left.fraction) {
        return right.fraction - left.fraction
      }

      return right.length - left.length
    })

  for (const ranked of rankedSegments) {
    if (remainder === 0) {
      break
    }

    baseCounts[ranked.index] += 1
    remainder -= 1
  }

  return baseCounts
}

function getIntermediateCountsForSpacing(
  segments: PathSegment[],
  targetSpacing: number,
): number[] {
  return segments.map((segment) =>
    Math.max(0, Math.floor(segment.length / targetSpacing) - 1),
  )
}

function clampTargetCount(
  targetCount: number,
  anchorCount: number,
  maxWaypoints: number | null,
): number {
  const minimumCount = anchorCount
  const maximumCount = maxWaypoints ?? Number.POSITIVE_INFINITY

  return Math.max(minimumCount, Math.min(targetCount, maximumCount))
}

function normalizeWaypointIds(waypoints: MissionWaypoint[]): MissionWaypoint[] {
  return waypoints.map((waypoint, index) => ({
    ...waypoint,
    id: index + 1,
  }))
}

function buildFinalWaypoints(
  anchors: MissionWaypoint[],
  segments: PathSegment[],
  intermediateCounts: number[],
): MissionWaypoint[] {
  if (anchors.length === 0) {
    return []
  }

  const anchorMap = new Map(anchors.map((anchor) => [anchor.id, anchor]))
  const result: MissionWaypoint[] = []

  anchors.forEach((anchor, index) => {
    result.push({
      ...anchor,
      role: 'anchor',
    })

    if (index >= segments.length) {
      return
    }

    const segment = segments[index]
    const segmentStart = anchorMap.get(segment.fromAnchorId) ?? anchor
    const segmentEnd = anchorMap.get(segment.toAnchorId)
    const intermediateCount = intermediateCounts[index] ?? 0

    if (!segmentEnd || intermediateCount <= 0) {
      return
    }

    for (let step = 1; step <= intermediateCount; step += 1) {
      const t = step / (intermediateCount + 1)

      result.push({
        id: 0,
        x: round2(segmentStart.x + (segmentEnd.x - segmentStart.x) * t),
        y: round2(segmentStart.y + (segmentEnd.y - segmentStart.y) * t),
        z: segmentStart.z + (segmentEnd.z - segmentStart.z) * t,
        actions: [],
        role: 'intermediate',
      })
    }
  })

  return normalizeWaypointIds(result)
}

export function resamplePath({
  anchors,
  pathSegments,
  config,
  constraints,
}: {
  anchors: MissionWaypoint[]
  pathSegments: PathSegment[]
  config: WaypointDensityConfig
  constraints: WaypointDensityConstraints
}): MissionWaypoint[] {
  if (anchors.length <= 1 || pathSegments.length === 0 || config.mode === 'auto') {
    return normalizeWaypointIds(
      anchors.map((anchor) => ({
        ...anchor,
        role: 'anchor',
      })),
    )
  }

  let intermediateCounts = pathSegments.map(() => 0)

  if (isCountMode(config)) {
    const targetCount = config.targetCount ?? anchors.length
    const totalCount = clampTargetCount(
      targetCount,
      anchors.length,
      constraints.maxWaypoints,
    )
    const totalIntermediateCount = Math.max(totalCount - anchors.length, 0)

    intermediateCounts = allocateIntermediateCountsByTarget(
      pathSegments,
      totalIntermediateCount,
    )
  } else if (isSpacingMode(config)) {
    const targetSpacing = Math.max(
      config.targetSpacing ?? constraints.minSpacing,
      constraints.minSpacing,
    )

    intermediateCounts = getIntermediateCountsForSpacing(pathSegments, targetSpacing)

    if (constraints.maxWaypoints !== null) {
      const currentCount =
        anchors.length +
        intermediateCounts.reduce((sum, count) => sum + count, 0)

      if (currentCount > constraints.maxWaypoints) {
        const cappedIntermediateCount = Math.max(
          constraints.maxWaypoints - anchors.length,
          0,
        )

        intermediateCounts = allocateIntermediateCountsByTarget(
          pathSegments,
          cappedIntermediateCount,
        )
      }
    }
  }

  return buildFinalWaypoints(anchors, pathSegments, intermediateCounts)
}

export function computeWaypointDensityMetrics({
  anchors,
  waypoints,
  pathSegments,
  constraints,
}: {
  anchors: MissionWaypoint[]
  waypoints: MissionWaypoint[]
  pathSegments: PathSegment[]
  constraints: WaypointDensityConstraints
}): WaypointDensityMetrics {
  const totalPathLength = round2(
    pathSegments.reduce((sum, segment) => sum + segment.length, 0),
  )
  const totalIntervals = Math.max(waypoints.length - 1, 0)
  const effectiveSpacing =
    totalIntervals > 0 ? round2(totalPathLength / totalIntervals) : null

  return {
    anchorCount: anchors.length,
    intermediateCount: Math.max(waypoints.length - anchors.length, 0),
    totalCount: waypoints.length,
    effectiveSpacing,
    totalPathLength,
    minimumCount: anchors.length,
    maximumCount: constraints.maxWaypoints,
  }
}
