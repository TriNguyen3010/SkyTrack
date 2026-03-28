import type { MissionWaypoint } from '../store/useMissionStore'
import type {
  PathSegment,
  WaypointDensityConfig,
  WaypointDensityConstraints,
  WaypointDensityMetrics,
} from './waypointDensityModels'
import {
  rdpSimplifyAnchors,
  simplifyAnchorsToTargetCount,
} from './waypointSimplify'

export interface DensityAdjustedPathResult {
  anchorWaypoints: MissionWaypoint[]
  pathSegments: PathSegment[]
  waypoints: MissionWaypoint[]
}

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

function isSimplifyMode(
  config: WaypointDensityConfig,
  anchorCount: number,
): boolean {
  if (config.mode === 'simplify') {
    return true
  }

  return config.mode === 'count' && config.targetCount !== null && config.targetCount < anchorCount
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

function buildClosedLoopAnchors(
  anchors: MissionWaypoint[],
  targetUniqueCount: number,
  config: WaypointDensityConfig,
  constraints: WaypointDensityConstraints,
): MissionWaypoint[] {
  const uniqueAnchors = anchors.slice(0, -1)

  if (uniqueAnchors.length <= 2) {
    return normalizeWaypointIds([
      ...uniqueAnchors.map((anchor) => ({
        ...anchor,
        role: 'anchor' as const,
      })),
      ...uniqueAnchors.slice(0, 1).map((anchor) => ({
        ...anchor,
        role: 'anchor' as const,
      })),
    ])
  }

  const simplifyOptions = {
    closed: true,
    minimumWaypointCount: Math.max((constraints.minimumWaypointCount ?? 2) - 1, 2),
    protectActioned: config.protectActioned !== false,
  }
  const simplifiedUniqueAnchors =
    config.simplifyTolerance !== null && config.simplifyTolerance !== undefined
      ? rdpSimplifyAnchors(uniqueAnchors, config.simplifyTolerance, simplifyOptions)
      : simplifyAnchorsToTargetCount(uniqueAnchors, targetUniqueCount, simplifyOptions)
  const closedLoopAnchors = [
    ...simplifiedUniqueAnchors,
    simplifiedUniqueAnchors[0],
  ].filter(Boolean) as MissionWaypoint[]

  return normalizeWaypointIds(
    closedLoopAnchors.map((anchor) => ({
      ...anchor,
      role: 'anchor',
    })),
  )
}

function resolveDensityAdjustedAnchors({
  anchors,
  config,
  constraints,
}: {
  anchors: MissionWaypoint[]
  config: WaypointDensityConfig
  constraints: WaypointDensityConstraints
}): MissionWaypoint[] {
  const normalizedAnchors = normalizeWaypointIds(
    anchors.map((anchor) => ({
      ...anchor,
      role: 'anchor',
    })),
  )

  if (
    normalizedAnchors.length <= 2 ||
    config.mode === 'auto' ||
    !isSimplifyMode(config, normalizedAnchors.length)
  ) {
    return normalizedAnchors
  }

  const minimumWaypointCount = Math.max(
    constraints.minimumWaypointCount ?? 2,
    constraints.isClosedLoop ? 3 : 2,
  )
  const targetCount =
    config.targetCount ??
    minimumWaypointCount

  if (constraints.isClosedLoop && normalizedAnchors.length >= 2) {
    const targetUniqueCount = Math.max(targetCount - 1, 2)

    return buildClosedLoopAnchors(
      normalizedAnchors,
      targetUniqueCount,
      config,
      constraints,
    )
  }

  const simplifyOptions = {
    closed: false,
    minimumWaypointCount,
    protectActioned: config.protectActioned !== false,
  }
  const simplifiedAnchors =
    config.simplifyTolerance !== null && config.simplifyTolerance !== undefined
      ? rdpSimplifyAnchors(normalizedAnchors, config.simplifyTolerance, simplifyOptions)
      : simplifyAnchorsToTargetCount(normalizedAnchors, targetCount, simplifyOptions)

  return normalizeWaypointIds(
    simplifiedAnchors.map((anchor) => ({
      ...anchor,
      role: 'anchor',
    })),
  )
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
  return buildDensityAdjustedPath({
    anchors,
    pathSegments,
    config,
    constraints,
  }).waypoints
}

export function buildDensityAdjustedPath({
  anchors,
  pathSegments,
  config,
  constraints,
}: {
  anchors: MissionWaypoint[]
  pathSegments: PathSegment[]
  config: WaypointDensityConfig
  constraints: WaypointDensityConstraints
}): DensityAdjustedPathResult {
  const effectiveAnchors = resolveDensityAdjustedAnchors({
    anchors,
    config,
    constraints,
  })
  const effectivePathSegments =
    pathSegments.length > 0 && effectiveAnchors.length === anchors.length
      ? pathSegments
      : buildPathSegmentsFromAnchors(effectiveAnchors)

  if (
    effectiveAnchors.length <= 1 ||
    effectivePathSegments.length === 0 ||
    config.mode === 'auto' ||
    isSimplifyMode(config, anchors.length)
  ) {
    return {
      anchorWaypoints: effectiveAnchors,
      pathSegments: effectivePathSegments,
      waypoints: normalizeWaypointIds(
        effectiveAnchors.map((anchor) => ({
          ...anchor,
          role: 'anchor',
        })),
      ),
    }
  }

  let intermediateCounts = effectivePathSegments.map(() => 0)

  if (isCountMode(config)) {
    const targetCount = config.targetCount ?? effectiveAnchors.length
    const totalCount = clampTargetCount(
      targetCount,
      effectiveAnchors.length,
      constraints.maxWaypoints,
    )
    const totalIntermediateCount = Math.max(totalCount - effectiveAnchors.length, 0)

    intermediateCounts = allocateIntermediateCountsByTarget(
      effectivePathSegments,
      totalIntermediateCount,
    )
  } else if (isSpacingMode(config)) {
    const targetSpacing = Math.max(
      config.targetSpacing ?? constraints.minSpacing,
      constraints.minSpacing,
    )

    intermediateCounts = getIntermediateCountsForSpacing(effectivePathSegments, targetSpacing)

    if (constraints.maxWaypoints !== null) {
      const currentCount =
        effectiveAnchors.length +
        intermediateCounts.reduce((sum, count) => sum + count, 0)

      if (currentCount > constraints.maxWaypoints) {
        const cappedIntermediateCount = Math.max(
          constraints.maxWaypoints - effectiveAnchors.length,
          0,
        )

        intermediateCounts = allocateIntermediateCountsByTarget(
          effectivePathSegments,
          cappedIntermediateCount,
        )
      }
    }
  }

  return {
    anchorWaypoints: effectiveAnchors,
    pathSegments: effectivePathSegments,
    waypoints: buildFinalWaypoints(
      effectiveAnchors,
      effectivePathSegments,
      intermediateCounts,
    ),
  }
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
