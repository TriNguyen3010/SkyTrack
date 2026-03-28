import type { MissionWaypoint } from '../store/useMissionStore'

interface SimplifyOptions {
  closed?: boolean
  minimumWaypointCount?: number
  protectActioned?: boolean
}

function cloneWaypoint(waypoint: MissionWaypoint): MissionWaypoint {
  return {
    ...waypoint,
    actions: [...waypoint.actions],
  }
}

function distance2D(
  left: Pick<MissionWaypoint, 'x' | 'y'>,
  right: Pick<MissionWaypoint, 'x' | 'y'>,
): number {
  const dx = right.x - left.x
  const dy = right.y - left.y

  return Math.sqrt(dx * dx + dy * dy)
}

function distanceToSegment(
  point: Pick<MissionWaypoint, 'x' | 'y'>,
  start: Pick<MissionWaypoint, 'x' | 'y'>,
  end: Pick<MissionWaypoint, 'x' | 'y'>,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (dx === 0 && dy === 0) {
    return distance2D(point, start)
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    ),
  )
  const projection = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  }

  return distance2D(point, projection)
}

function getBoundsDiagonal(anchors: MissionWaypoint[]): number {
  if (anchors.length === 0) {
    return 0
  }

  const bounds = anchors.reduce(
    (current, anchor) => ({
      minX: Math.min(current.minX, anchor.x),
      maxX: Math.max(current.maxX, anchor.x),
      minY: Math.min(current.minY, anchor.y),
      maxY: Math.max(current.maxY, anchor.y),
    }),
    {
      minX: anchors[0].x,
      maxX: anchors[0].x,
      minY: anchors[0].y,
      maxY: anchors[0].y,
    },
  )

  return Math.sqrt(
    (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2,
  )
}

function getTurnAngleDegrees(anchors: MissionWaypoint[], index: number): number {
  const previous = anchors[(index - 1 + anchors.length) % anchors.length]
  const current = anchors[index]
  const next = anchors[(index + 1) % anchors.length]

  if (!previous || !current || !next) {
    return 0
  }

  const incoming = {
    x: current.x - previous.x,
    y: current.y - previous.y,
  }
  const outgoing = {
    x: next.x - current.x,
    y: next.y - current.y,
  }
  const incomingLength = Math.sqrt(incoming.x * incoming.x + incoming.y * incoming.y)
  const outgoingLength = Math.sqrt(outgoing.x * outgoing.x + outgoing.y * outgoing.y)

  if (incomingLength === 0 || outgoingLength === 0) {
    return 0
  }

  const cosine =
    (incoming.x * outgoing.x + incoming.y * outgoing.y) /
    (incomingLength * outgoingLength)

  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI
}

function rotateArray<T>(items: T[], startIndex: number): T[] {
  if (items.length === 0) {
    return []
  }

  const normalizedStartIndex =
    ((startIndex % items.length) + items.length) % items.length

  return [
    ...items.slice(normalizedStartIndex),
    ...items.slice(0, normalizedStartIndex),
  ]
}

function collectProtectedIndices(
  anchors: MissionWaypoint[],
  {
    closed = false,
    protectActioned = true,
  }: SimplifyOptions,
): Set<number> {
  const protectedIndices = new Set<number>()

  if (anchors.length === 0) {
    return protectedIndices
  }

  if (closed) {
    protectedIndices.add(0)
  } else {
    protectedIndices.add(0)
    protectedIndices.add(anchors.length - 1)
  }

  if (protectActioned) {
    anchors.forEach((anchor, index) => {
      if (anchor.actions.length > 0) {
        protectedIndices.add(index)
      }
    })
  }

  return protectedIndices
}

function runRdpSegment(
  points: Array<Pick<MissionWaypoint, 'x' | 'y'>>,
  startIndex: number,
  endIndex: number,
  tolerance: number,
  keptIndices: Set<number>,
) {
  if (endIndex - startIndex <= 1) {
    keptIndices.add(startIndex)
    keptIndices.add(endIndex)
    return
  }

  let farthestIndex = -1
  let farthestDistance = -1

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const distance = distanceToSegment(points[index], points[startIndex], points[endIndex])

    if (distance > farthestDistance) {
      farthestDistance = distance
      farthestIndex = index
    }
  }

  if (farthestIndex !== -1 && farthestDistance > tolerance) {
    runRdpSegment(points, startIndex, farthestIndex, tolerance, keptIndices)
    runRdpSegment(points, farthestIndex, endIndex, tolerance, keptIndices)
    return
  }

  keptIndices.add(startIndex)
  keptIndices.add(endIndex)
}

function runRdpWithRequiredIndices(
  anchors: MissionWaypoint[],
  tolerance: number,
  requiredIndices: Set<number>,
): MissionWaypoint[] {
  if (anchors.length <= 2) {
    return anchors.map(cloneWaypoint)
  }

  const keptIndices = new Set<number>(requiredIndices)
  const splitPoints = [...requiredIndices].sort((left, right) => left - right)

  if (splitPoints.length <= 1) {
    splitPoints.splice(0, splitPoints.length, 0, anchors.length - 1)
  }

  for (let index = 1; index < splitPoints.length; index += 1) {
    runRdpSegment(
      anchors,
      splitPoints[index - 1],
      splitPoints[index],
      tolerance,
      keptIndices,
    )
  }

  return [...keptIndices]
    .sort((left, right) => left - right)
    .map((index) => cloneWaypoint(anchors[index]))
}

function simplifyOpenAnchors(
  anchors: MissionWaypoint[],
  tolerance: number,
  options: SimplifyOptions,
): MissionWaypoint[] {
  const requiredIndices = collectProtectedIndices(anchors, options)
  requiredIndices.add(0)
  requiredIndices.add(anchors.length - 1)

  return runRdpWithRequiredIndices(anchors, tolerance, requiredIndices)
}

function getClosedPivotIndex(anchors: MissionWaypoint[]): number {
  return anchors.reduce((bestIndex, _anchor, index) => {
    const nextAngle = getTurnAngleDegrees(anchors, index)
    const currentAngle = getTurnAngleDegrees(anchors, bestIndex)

    return nextAngle > currentAngle ? index : bestIndex
  }, 0)
}

function simplifyClosedAnchors(
  anchors: MissionWaypoint[],
  tolerance: number,
  options: SimplifyOptions,
): MissionWaypoint[] {
  if (anchors.length <= 3) {
    return anchors.map(cloneWaypoint)
  }

  const pivotIndex = getClosedPivotIndex(anchors)
  const rotatedAnchors = rotateArray(anchors, pivotIndex)
  const protectedIndices = collectProtectedIndices(anchors, options)
  const rotatedProtectedIndices = new Set<number>()

  protectedIndices.forEach((index) => {
    rotatedProtectedIndices.add((index - pivotIndex + anchors.length) % anchors.length)
  })

  rotatedProtectedIndices.add(0)

  const closedChain = [...rotatedAnchors.map(cloneWaypoint), cloneWaypoint(rotatedAnchors[0])]
  const requiredIndices = new Set<number>(rotatedProtectedIndices)
  requiredIndices.add(closedChain.length - 1)

  const simplifiedChain = runRdpWithRequiredIndices(closedChain, tolerance, requiredIndices)
  const simplifiedUnique = simplifiedChain.slice(0, -1)
  const originalStartIndex = simplifiedUnique.findIndex(
    (anchor) => anchor.id === anchors[0]?.id,
  )

  if (originalStartIndex === -1) {
    return simplifiedUnique
  }

  return rotateArray(simplifiedUnique, originalStartIndex)
}

function getProtectedAnchorCount(
  anchors: MissionWaypoint[],
  options: SimplifyOptions,
): number {
  return collectProtectedIndices(anchors, options).size
}

function expandSimplifiedAnchorsToTargetCount(
  anchors: MissionWaypoint[],
  simplifiedAnchors: MissionWaypoint[],
  targetCount: number,
  closed: boolean,
): MissionWaypoint[] {
  if (simplifiedAnchors.length >= targetCount) {
    return simplifiedAnchors
  }

  const indexById = new Map(anchors.map((anchor, index) => [anchor.id, index]))
  const selectedIndices = new Set<number>()

  simplifiedAnchors.forEach((anchor) => {
    const anchorIndex = indexById.get(anchor.id)

    if (anchorIndex !== undefined) {
      selectedIndices.add(anchorIndex)
    }
  })

  const totalAnchors = anchors.length

  while (selectedIndices.size < targetCount) {
    const orderedIndices = [...selectedIndices].sort((left, right) => left - right)
    let bestCandidateIndex: number | null = null
    let bestCandidateDistance = -1
    let bestCandidateSpan = -1

    const rawGaps = closed
      ? orderedIndices.map((startIndex, index) => {
          const nextIndex = orderedIndices[(index + 1) % orderedIndices.length] ?? startIndex
          const wrappedNextIndex =
            index === orderedIndices.length - 1 ? nextIndex + totalAnchors : nextIndex

          return [startIndex, wrappedNextIndex] as const
        })
      : orderedIndices.slice(0, -1).map((startIndex, index) => {
          const endIndex = orderedIndices[index + 1] ?? startIndex

          return [startIndex, endIndex] as const
        })

    rawGaps.forEach(([startRawIndex, endRawIndex]) => {
      if (endRawIndex - startRawIndex <= 1) {
        return
      }

      const span = endRawIndex - startRawIndex
      const startAnchor = anchors[startRawIndex % totalAnchors]
      const endAnchor = anchors[endRawIndex % totalAnchors]
      let gapBestIndex: number | null = null
      let gapBestDistance = -1

      for (let rawIndex = startRawIndex + 1; rawIndex < endRawIndex; rawIndex += 1) {
        const candidateIndex = rawIndex % totalAnchors

        if (selectedIndices.has(candidateIndex)) {
          continue
        }

        const candidateDistance = distanceToSegment(
          anchors[candidateIndex],
          startAnchor,
          endAnchor,
        )

        if (
          candidateDistance > gapBestDistance ||
          (candidateDistance === gapBestDistance &&
            gapBestIndex !== null &&
            Math.abs(rawIndex - (startRawIndex + endRawIndex) / 2) <
              Math.abs(((gapBestIndex >= startRawIndex ? gapBestIndex : gapBestIndex + totalAnchors)) - (startRawIndex + endRawIndex) / 2))
        ) {
          gapBestIndex = candidateIndex
          gapBestDistance = candidateDistance
        }
      }

      if (gapBestIndex === null) {
        return
      }

      if (
        gapBestDistance > bestCandidateDistance ||
        (gapBestDistance === bestCandidateDistance && span > bestCandidateSpan)
      ) {
        bestCandidateIndex = gapBestIndex
        bestCandidateDistance = gapBestDistance
        bestCandidateSpan = span
      }
    })

    if (bestCandidateIndex === null) {
      break
    }

    selectedIndices.add(bestCandidateIndex)
  }

  return [...selectedIndices]
    .sort((left, right) => left - right)
    .map((index) => cloneWaypoint(anchors[index]))
}

export function rdpSimplifyAnchors(
  anchors: MissionWaypoint[],
  tolerance: number,
  options: SimplifyOptions = {},
): MissionWaypoint[] {
  if (anchors.length <= 2) {
    return anchors.map(cloneWaypoint)
  }

  return options.closed
    ? simplifyClosedAnchors(anchors, tolerance, options)
    : simplifyOpenAnchors(anchors, tolerance, options)
}

export function findToleranceForTargetCount(
  anchors: MissionWaypoint[],
  targetCount: number,
  options: SimplifyOptions = {},
): number {
  if (anchors.length <= 2 || targetCount >= anchors.length) {
    return 0
  }

  let low = 0
  let high = Math.max(getBoundsDiagonal(anchors), 1)

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const mid = (low + high) / 2
    const simplified = rdpSimplifyAnchors(anchors, mid, options)

    if (simplified.length > targetCount) {
      low = mid
    } else {
      high = mid
    }
  }

  return high
}

export function simplifyAnchorsToTargetCount(
  anchors: MissionWaypoint[],
  targetCount: number,
  options: SimplifyOptions = {},
): MissionWaypoint[] {
  if (anchors.length <= 2) {
    return anchors.map(cloneWaypoint)
  }

  const minimumWaypointCount = Math.max(
    options.minimumWaypointCount ?? 2,
    getProtectedAnchorCount(anchors, options),
  )
  const clampedTargetCount = Math.max(
    minimumWaypointCount,
    Math.min(targetCount, anchors.length),
  )

  if (clampedTargetCount >= anchors.length) {
    return anchors.map(cloneWaypoint)
  }

  const tolerance = findToleranceForTargetCount(anchors, clampedTargetCount, options)
  const simplified = rdpSimplifyAnchors(anchors, tolerance, options)

  if (simplified.length === clampedTargetCount) {
    return simplified
  }

  if (simplified.length < clampedTargetCount) {
    return expandSimplifiedAnchorsToTargetCount(
      anchors,
      simplified,
      clampedTargetCount,
      options.closed ?? false,
    )
  }

  return simplified
}
