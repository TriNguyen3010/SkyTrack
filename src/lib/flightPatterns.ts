import {
  generateCoverageSegments,
  generateCoverageWaypoints,
  polygonCentroid,
  type Vec2,
} from './missionGeometry'
import { clipSegmentsAgainstExclusions } from './exclusionGeometry'
import { isPointInAnyExclusion } from './exclusionGeometry'
import type {
  ExclusionZone,
  MissionPoint,
  MissionWaypoint,
} from '../store/useMissionStore'

type XYPoint = Pick<MissionPoint, 'x' | 'y'>

export type FlightPatternId =
  | 'coverage'
  | 'perimeter'
  | 'orbit'
  | 'spiral'
  | 'grid'
  | 'corridor'

export interface CoveragePatternParams {
  lineSpacing: number
  orientation: number
  scanAltitude: number
}

export interface PerimeterPatternParams {
  insetDistance: number
  loops: number
  direction: 'cw' | 'ccw'
  scanAltitude: number
}

export interface OrbitPatternParams {
  centerMode: 'auto' | 'manual'
  manualCenter: Vec2
  radiusMode: 'auto-fit' | 'manual'
  radius: number
  waypointCount: number
  loops: number
  direction: 'cw' | 'ccw'
  scanAltitude: number
}

export interface SpiralPatternParams {
  spiralDirection: 'inward' | 'outward'
  armSpacing: number
  rotationDirection: 'cw' | 'ccw'
  scanAltitude: number
}

export interface GridPatternParams {
  lineSpacing: number
  orientation: number
  crossAngle: number
  scanAltitude: number
}

export interface CorridorPatternParams {
  passes: number
  passSpacing: number
  direction: 'auto' | 'reverse'
  scanAltitude: number
}

export interface PatternParamsMap {
  coverage: CoveragePatternParams
  perimeter: PerimeterPatternParams
  orbit: OrbitPatternParams
  spiral: SpiralPatternParams
  grid: GridPatternParams
  corridor: CorridorPatternParams
}

export type FlightPatternParams = PatternParamsMap[FlightPatternId]

export interface FlightPatternOption {
  id: FlightPatternId
  label: string
  shortLabel: string
  description: string
  color: string
  implemented: boolean
}

export interface FlightPatternMissionMeta {
  estimatedLength: number
  loops: number
  direction: string | null
}

export interface FlightPatternMissionResult {
  patternId: FlightPatternId
  segments: Array<[Vec2, Vec2]>
  waypoints: MissionWaypoint[]
  closed: boolean
  meta: FlightPatternMissionMeta
}

export interface FlightPatternBuildContext {
  points: MissionPoint[]
  exclusionZones: ExclusionZone[]
  paramsByPattern: PatternParamsMap
}

export interface FlightPatternDefinition extends FlightPatternOption {
  defaultParams: FlightPatternParams
  generateMission?: (
    context: FlightPatternBuildContext,
  ) => FlightPatternMissionResult
}

const FLIGHT_PATTERN_REGISTRY: Record<FlightPatternId, FlightPatternDefinition> = {
  coverage: {
    id: 'coverage',
    label: 'Coverage Scan',
    shortLabel: 'Coverage Area Scan',
    description: 'Automated lawnmower coverage across the full polygon.',
    color: '#8b5cf6',
    implemented: true,
    defaultParams: {
      lineSpacing: 10,
      orientation: 0,
      scanAltitude: 40,
    },
    generateMission: generateCoverageMission,
  },
  perimeter: {
    id: 'perimeter',
    label: 'Perimeter',
    shortLabel: 'Perimeter Scan',
    description: 'Follow the outer boundary of the region.',
    color: '#f97316',
    implemented: true,
    defaultParams: {
      insetDistance: 0,
      loops: 1,
      direction: 'cw',
      scanAltitude: 40,
    },
    generateMission: generatePerimeterMission,
  },
  orbit: {
    id: 'orbit',
    label: 'Orbit / POI',
    shortLabel: 'Orbit / POI',
    description: 'Circle around a target area or point of interest.',
    color: '#f59e0b',
    implemented: true,
    defaultParams: {
      centerMode: 'auto',
      manualCenter: { x: 0, y: 0 },
      radiusMode: 'auto-fit',
      radius: 40,
      waypointCount: 24,
      loops: 1,
      direction: 'cw',
      scanAltitude: 40,
    },
    generateMission: generateOrbitMission,
  },
  spiral: {
    id: 'spiral',
    label: 'Spiral',
    shortLabel: 'Spiral Scan',
    description: 'Sweep inward with a spiral path from the boundary.',
    color: '#10b981',
    implemented: true,
    defaultParams: {
      spiralDirection: 'inward',
      armSpacing: 12,
      rotationDirection: 'cw',
      scanAltitude: 40,
    },
    generateMission: generateSpiralMission,
  },
  grid: {
    id: 'grid',
    label: 'Grid',
    shortLabel: 'Grid Scan',
    description: 'Cross-hatch the area with an orthogonal grid.',
    color: '#ec4899',
    implemented: true,
    defaultParams: {
      lineSpacing: 10,
      orientation: 0,
      crossAngle: 90,
      scanAltitude: 40,
    },
    generateMission: generateGridMission,
  },
  corridor: {
    id: 'corridor',
    label: 'Corridor',
    shortLabel: 'Corridor Scan',
    description: 'Run a centered corridor-style flight path.',
    color: '#06b6d4',
    implemented: true,
    defaultParams: {
      passes: 1,
      passSpacing: 10,
      direction: 'auto',
      scanAltitude: 40,
    },
    generateMission: generateCorridorMission,
  },
}

export const FLIGHT_PATTERN_OPTIONS: FlightPatternOption[] = Object.values(
  FLIGHT_PATTERN_REGISTRY,
)

export function getFlightPatternDefinition(
  patternId: FlightPatternId,
): FlightPatternDefinition {
  return FLIGHT_PATTERN_REGISTRY[patternId] ?? FLIGHT_PATTERN_REGISTRY.coverage
}

export function getFlightPatternOption(
  patternId: FlightPatternId,
): FlightPatternOption {
  return getFlightPatternDefinition(patternId)
}

export function buildFlightPatternMission(
  patternId: FlightPatternId,
  context: FlightPatternBuildContext,
): FlightPatternMissionResult | null {
  const pattern = getFlightPatternDefinition(patternId)

  if (!pattern.generateMission) {
    return null
  }

  return pattern.generateMission(context)
}

export function createInitialPatternParams(seed?: {
  scanAltitude?: number
  lineSpacing?: number
  orientation?: number
}): PatternParamsMap {
  const scanAltitude = seed?.scanAltitude ?? 50
  const lineSpacing = seed?.lineSpacing ?? 10
  const orientation = seed?.orientation ?? 0

  return {
    coverage: {
      scanAltitude,
      lineSpacing,
      orientation,
    },
    perimeter: {
      scanAltitude,
      insetDistance: 0,
      loops: 1,
      direction: 'cw',
    },
    orbit: {
      scanAltitude,
      centerMode: 'auto',
      manualCenter: { x: 0, y: 0 },
      radiusMode: 'auto-fit',
      radius: 40,
      waypointCount: 24,
      loops: 1,
      direction: 'cw',
    },
    spiral: {
      scanAltitude,
      spiralDirection: 'inward',
      armSpacing: 12,
      rotationDirection: 'cw',
    },
    grid: {
      scanAltitude,
      lineSpacing,
      orientation,
      crossAngle: 90,
    },
    corridor: {
      scanAltitude,
      passes: 1,
      passSpacing: 10,
      direction: 'auto',
    },
  }
}

export function clampPatternParams<K extends FlightPatternId>(
  patternId: K,
  params: PatternParamsMap[K],
): PatternParamsMap[K] {
  switch (patternId) {
    case 'coverage': {
      const coverageParams = params as CoveragePatternParams

      return {
        ...coverageParams,
        scanAltitude: clampNumber(coverageParams.scanAltitude, 10, 200),
        lineSpacing: clampNumber(coverageParams.lineSpacing, 5, 50),
        orientation: clampNumber(coverageParams.orientation, -180, 180),
      } as PatternParamsMap[K]
    }
    case 'perimeter': {
      const perimeterParams = params as PerimeterPatternParams

      return {
        ...perimeterParams,
        scanAltitude: clampNumber(perimeterParams.scanAltitude, 10, 200),
        insetDistance: clampNumber(perimeterParams.insetDistance, 0, 30),
        loops: clampInteger(perimeterParams.loops, 1, 5),
      } as PatternParamsMap[K]
    }
    case 'orbit': {
      const orbitParams = params as OrbitPatternParams

      return {
        ...orbitParams,
        scanAltitude: clampNumber(orbitParams.scanAltitude, 10, 200),
        radius: clampNumber(orbitParams.radius, 10, 200),
        waypointCount: clampInteger(orbitParams.waypointCount, 8, 72),
        loops: clampInteger(orbitParams.loops, 1, 5),
        manualCenter: {
          x: clampNumber(orbitParams.manualCenter.x, -120, 120),
          y: clampNumber(orbitParams.manualCenter.y, -90, 90),
        },
      } as PatternParamsMap[K]
    }
    case 'spiral': {
      const spiralParams = params as SpiralPatternParams

      return {
        ...spiralParams,
        scanAltitude: clampNumber(spiralParams.scanAltitude, 10, 200),
        armSpacing: clampNumber(spiralParams.armSpacing, 5, 40),
      } as PatternParamsMap[K]
    }
    case 'grid': {
      const gridParams = params as GridPatternParams

      return {
        ...gridParams,
        scanAltitude: clampNumber(gridParams.scanAltitude, 10, 200),
        lineSpacing: clampNumber(gridParams.lineSpacing, 5, 50),
        orientation: clampNumber(gridParams.orientation, -180, 180),
        crossAngle: clampNumber(gridParams.crossAngle, 45, 135),
      } as PatternParamsMap[K]
    }
    case 'corridor': {
      const corridorParams = params as CorridorPatternParams

      return {
        ...corridorParams,
        scanAltitude: clampNumber(corridorParams.scanAltitude, 10, 200),
        passes: clampInteger(corridorParams.passes, 1, 5),
        passSpacing: clampNumber(corridorParams.passSpacing, 5, 30),
      } as PatternParamsMap[K]
    }
  }
}

function generateCoverageMission({
  points,
  exclusionZones,
  paramsByPattern,
}: FlightPatternBuildContext): FlightPatternMissionResult {
  const { scanAltitude, lineSpacing, orientation } = paramsByPattern.coverage
  const rawSegments = generateCoverageSegments(points, lineSpacing, orientation)
  const segments = clipSegmentsAgainstExclusions(rawSegments, exclusionZones)
  const waypoints = generateCoverageWaypoints(segments, scanAltitude)

  return {
    patternId: 'coverage',
    segments,
    waypoints,
    closed: false,
    meta: {
      estimatedLength: estimateWaypointPathLength(waypoints),
      loops: 1,
      direction: 'alternating',
    },
  }
}

function generatePerimeterMission({
  points,
  exclusionZones,
  paramsByPattern,
}: FlightPatternBuildContext): FlightPatternMissionResult {
  const { scanAltitude, insetDistance, loops, direction } =
    paramsByPattern.perimeter
  const insetBoundary =
    insetDistance > 0 ? insetPolygonRadially(points, insetDistance) : [...points]
  const orderedBoundary = getPerimeterRing(insetBoundary, direction)
  const waypointRoute: MissionWaypoint[] = []

  for (let loopIndex = 0; loopIndex < loops; loopIndex += 1) {
    const loopPoints = loopIndex === 0 ? orderedBoundary : orderedBoundary.slice(1)

    loopPoints.forEach((point) => {
      waypointRoute.push({
        id: waypointRoute.length + 1,
        x: Math.round(point.x * 100) / 100,
        y: Math.round(point.y * 100) / 100,
        z: scanAltitude,
        actions: [],
      })
    })
  }

  const filteredWaypoints = normalizeWaypointIds(
    filterWaypointsOutsideExclusions(waypointRoute, exclusionZones),
  )

  return {
    patternId: 'perimeter',
    segments: buildSegmentsFromWaypointRoute(filteredWaypoints),
    waypoints: filteredWaypoints,
    closed: isWaypointRouteClosed(filteredWaypoints),
    meta: {
      estimatedLength: estimateWaypointPathLength(filteredWaypoints),
      loops,
      direction: direction.toUpperCase(),
    },
  }
}

function generateOrbitMission({
  points,
  exclusionZones,
  paramsByPattern,
}: FlightPatternBuildContext): FlightPatternMissionResult {
  const {
    scanAltitude,
    centerMode,
    manualCenter,
    radiusMode,
    radius: manualRadius,
    waypointCount,
    loops,
    direction,
  } = paramsByPattern.orbit

  if (points.length < 3) {
    return {
      patternId: 'orbit',
      segments: [],
      waypoints: [],
      closed: true,
      meta: {
        estimatedLength: 0,
        loops: 1,
        direction: 'CW',
      },
    }
  }

  const center =
    centerMode === 'manual' ? manualCenter : getStableMissionCenter(points)
  const radius =
    radiusMode === 'manual'
      ? manualRadius
      : getAutoOrbitRadius(points, center)
  const baseRing = buildOrbitRing({
    center,
    radius,
    waypointCount,
    direction,
  })
  const orbitRoute: MissionWaypoint[] = []

  for (let loopIndex = 0; loopIndex < loops; loopIndex += 1) {
    const loopPoints = loopIndex === 0 ? baseRing : baseRing.slice(1)

    loopPoints.forEach((point) => {
      orbitRoute.push({
        id: orbitRoute.length + 1,
        x: Math.round(point.x * 100) / 100,
        y: Math.round(point.y * 100) / 100,
        z: scanAltitude,
        actions: [],
      })
    })
  }

  const filteredWaypoints = normalizeWaypointIds(
    filterWaypointsOutsideExclusions(orbitRoute, exclusionZones),
  )

  return {
    patternId: 'orbit',
    segments: buildSegmentsFromWaypointRoute(filteredWaypoints),
    waypoints: filteredWaypoints,
    closed: isWaypointRouteClosed(filteredWaypoints),
    meta: {
      estimatedLength: estimateWaypointPathLength(filteredWaypoints),
      loops,
      direction: direction.toUpperCase(),
    },
  }
}

function generateGridMission({
  points,
  exclusionZones,
  paramsByPattern,
}: FlightPatternBuildContext): FlightPatternMissionResult {
  const { scanAltitude, lineSpacing, orientation, crossAngle } = paramsByPattern.grid
  const primarySegments = clipSegmentsAgainstExclusions(
    generateCoverageSegments(points, lineSpacing, orientation),
    exclusionZones,
  )
  const secondarySegments = clipSegmentsAgainstExclusions(
    generateCoverageSegments(
      points,
      lineSpacing,
      orientation + crossAngle,
    ),
    exclusionZones,
  )
  const primaryWaypoints = generateCoverageWaypoints(primarySegments, scanAltitude)
  const secondaryWaypoints = generateCoverageWaypoints(
    secondarySegments,
    scanAltitude,
  )
  const stitchedSecondaryWaypoints = alignWaypointRouteToPrevious(
    secondaryWaypoints,
    primaryWaypoints.at(-1) ?? null,
  )
  const waypoints = normalizeWaypointIds([
    ...primaryWaypoints,
    ...stitchedSecondaryWaypoints,
  ])

  return {
    patternId: 'grid',
    segments: [...primarySegments, ...secondarySegments],
    waypoints,
    closed: false,
    meta: {
      estimatedLength: estimateWaypointPathLength(waypoints),
      loops: 2,
      direction: 'cross-hatch',
    },
  }
}

function generateCorridorMission({
  points,
  exclusionZones,
  paramsByPattern,
}: FlightPatternBuildContext): FlightPatternMissionResult {
  const { scanAltitude, passes, passSpacing, direction } = paramsByPattern.corridor
  const corridorSegments = clipSegmentsAgainstExclusions(
    buildCorridorSegments(points, passes, passSpacing),
    exclusionZones,
  )
  const orderedSegments =
    direction === 'reverse' ? [...corridorSegments].reverse() : corridorSegments
  const waypoints = normalizeWaypointIds(
    generateCoverageWaypoints(orderedSegments, scanAltitude),
  )

  return {
    patternId: 'corridor',
    segments: corridorSegments,
    waypoints,
    closed: false,
    meta: {
      estimatedLength: estimateWaypointPathLength(waypoints),
      loops: passes,
      direction: direction.toUpperCase(),
    },
  }
}

function generateSpiralMission({
  points,
  exclusionZones,
  paramsByPattern,
}: FlightPatternBuildContext): FlightPatternMissionResult {
  const {
    scanAltitude,
    spiralDirection,
    armSpacing,
    rotationDirection,
  } = paramsByPattern.spiral
  const center = getStableMissionCenter(points)
  const bounds = getPointBounds(points)
  const boundingRadius = Math.max(
    ...points.map((point) => distanceBetween2D(point, center)),
    18,
  )
  const b = armSpacing / (Math.PI * 2)
  const maxTheta = Math.max(boundingRadius / b, Math.PI * 2)
  const sampleCount = Math.max(72, Math.ceil(maxTheta * 14))
  const directionSign = rotationDirection === 'cw' ? -1 : 1
  const outwardRoute: Vec2[] = []

  for (let index = 0; index <= sampleCount; index += 1) {
    const ratio = index / sampleCount
    const theta = maxTheta * ratio
    const radius = b * theta
    const candidate = {
      x: center.x + radius * Math.cos(directionSign * theta),
      y: center.y + radius * Math.sin(directionSign * theta),
    }

    if (
      candidate.x < bounds.minX - 4 ||
      candidate.x > bounds.maxX + 4 ||
      candidate.y < bounds.minY - 4 ||
      candidate.y > bounds.maxY + 4
    ) {
      continue
    }

    if (isPointInPolygon(candidate, points)) {
      outwardRoute.push(candidate)
    }
  }

  const dedupedOutwardRoute = dedupeRoutePoints(outwardRoute)
  const routePoints =
    spiralDirection === 'outward'
      ? dedupedOutwardRoute
      : [...dedupedOutwardRoute].reverse()
  const spiralCandidates: MissionWaypoint[] = routePoints.map((point) => ({
    id: 0,
    x: Math.round(point.x * 100) / 100,
    y: Math.round(point.y * 100) / 100,
    z: scanAltitude,
    actions: [],
  }))
  const waypoints = normalizeWaypointIds(
    filterWaypointsOutsideExclusions(spiralCandidates, exclusionZones),
  )

  return {
    patternId: 'spiral',
    segments: buildSegmentsFromWaypointRoute(waypoints),
    waypoints,
    closed: false,
    meta: {
      estimatedLength: estimateWaypointPathLength(waypoints),
      loops: 1,
      direction: `${spiralDirection.toUpperCase()} ${rotationDirection.toUpperCase()}`,
    },
  }
}

function filterWaypointsOutsideExclusions(
  waypoints: MissionWaypoint[],
  exclusionZones: ExclusionZone[],
): MissionWaypoint[] {
  if (exclusionZones.length === 0) {
    return [...waypoints]
  }

  return waypoints.filter(
    (waypoint) =>
      !isPointInAnyExclusion(
        {
          x: waypoint.x,
          y: waypoint.y,
        },
        exclusionZones,
      ),
  )
}

function buildSegmentsFromWaypointRoute(
  waypoints: MissionWaypoint[],
): Array<[Vec2, Vec2]> {
  const segments: Array<[Vec2, Vec2]> = []

  for (let index = 1; index < waypoints.length; index += 1) {
    segments.push([
      { x: waypoints[index - 1].x, y: waypoints[index - 1].y },
      { x: waypoints[index].x, y: waypoints[index].y },
    ])
  }

  return segments
}

function isWaypointRouteClosed(waypoints: MissionWaypoint[]): boolean {
  if (waypoints.length < 3) {
    return false
  }

  const first = waypoints[0]
  const last = waypoints[waypoints.length - 1]

  return distanceBetween2D(first, last) < 0.01
}

function getPerimeterRing(
  points: Array<Pick<MissionPoint, 'x' | 'y'>>,
  direction: PerimeterPatternParams['direction'],
): Vec2[] {
  if (points.length < 3) {
    return []
  }

  const normalized =
    direction === 'cw'
      ? ensureClockwise(points)
      : ensureCounterClockwise(points)

  return [...normalized, normalized[0]].map((point) => ({
    x: point.x,
    y: point.y,
  }))
}

function buildOrbitRing({
  center,
  radius,
  waypointCount,
  direction,
}: {
  center: Vec2
  radius: number
  waypointCount: number
  direction: OrbitPatternParams['direction']
}): Vec2[] {
  const directionSign = direction === 'cw' ? -1 : 1
  const ring: Vec2[] = []

  for (let index = 0; index < waypointCount; index += 1) {
    const angle = directionSign * ((Math.PI * 2 * index) / waypointCount)

    ring.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    })
  }

  return [...ring, ring[0]]
}

function getAutoOrbitRadius(points: MissionPoint[], center: Vec2): number {
  const farthestDistance = points.reduce((maxDistance, point) => {
    const dx = point.x - center.x
    const dy = point.y - center.y

    return Math.max(maxDistance, Math.sqrt(dx * dx + dy * dy))
  }, 0)

  return Math.max(farthestDistance, 18)
}

function buildCorridorSegments(
  points: MissionPoint[],
  passes: number,
  passSpacing: number,
): Array<[Vec2, Vec2]> {
  if (points.length < 3) {
    return []
  }

  const bounds = getPointBounds(points)
  const center = getStableMissionCenter(points)
  const isHorizontal = bounds.width >= bounds.height
  const angle = isHorizontal ? 0 : 90
  const offsets = getPassOffsets(passes, passSpacing)
  const segments = offsets
    .map((offset) => getLongestCrossSection(points, center, angle, offset))
    .filter((segment): segment is [Vec2, Vec2] => segment !== null)

  return segments
}

function getPassOffsets(passes: number, passSpacing: number): number[] {
  if (passes <= 1) {
    return [0]
  }

  return Array.from({ length: passes }, (_, index) => {
    const centeredIndex = index - (passes - 1) / 2
    return centeredIndex * passSpacing
  })
}

function getLongestCrossSection(
  points: MissionPoint[],
  center: Vec2,
  angleDegrees: number,
  offsetFromCenter: number,
): [Vec2, Vec2] | null {
  const rotated = points.map((point) => rotatePoint(point, center, -angleDegrees))
  const targetY = rotatePoint(
    { x: center.x, y: center.y + offsetFromCenter },
    center,
    -angleDegrees,
  ).y
  const intersections: number[] = []

  for (let index = 0; index < rotated.length; index += 1) {
    const current = rotated[index]
    const next = rotated[(index + 1) % rotated.length]
    const lowY = Math.min(current.y, next.y)
    const highY = Math.max(current.y, next.y)

    if (lowY === highY || targetY < lowY || targetY >= highY) {
      continue
    }

    const ratio = (targetY - current.y) / (next.y - current.y)
    intersections.push(current.x + (next.x - current.x) * ratio)
  }

  intersections.sort((left, right) => left - right)

  let bestSegment: [Vec2, Vec2] | null = null
  let bestLength = 0

  for (let index = 0; index < intersections.length - 1; index += 2) {
    const start = rotatePoint(
      { x: intersections[index], y: targetY },
      center,
      angleDegrees,
    )
    const end = rotatePoint(
      { x: intersections[index + 1], y: targetY },
      center,
      angleDegrees,
    )
    const length = distanceBetween2D(start, end)

    if (length > bestLength) {
      bestLength = length
      bestSegment = [start, end]
    }
  }

  return bestSegment
}

function estimateWaypointPathLength(waypoints: MissionWaypoint[]): number {
  let total = 0

  for (let index = 1; index < waypoints.length; index += 1) {
    total += distanceBetween(waypoints[index - 1], waypoints[index])
  }

  return Math.round(total * 100) / 100
}

function alignWaypointRouteToPrevious(
  waypoints: MissionWaypoint[],
  previousWaypoint: MissionWaypoint | null,
): MissionWaypoint[] {
  if (waypoints.length === 0 || !previousWaypoint) {
    return [...waypoints]
  }

  const forwardDistance = distanceBetween(previousWaypoint, waypoints[0])
  const reverseDistance = distanceBetween(
    previousWaypoint,
    waypoints[waypoints.length - 1],
  )

  return reverseDistance < forwardDistance ? [...waypoints].reverse() : [...waypoints]
}

function normalizeWaypointIds(waypoints: MissionWaypoint[]): MissionWaypoint[] {
  return waypoints.map((waypoint, index) => ({
    ...waypoint,
    id: index + 1,
  }))
}

function insetPolygonRadially(
  points: XYPoint[],
  insetDistance: number,
): XYPoint[] {
  const center = getStableMissionCenter(points)

  return points.map((point) => {
    const dx = center.x - point.x
    const dy = center.y - point.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance <= insetDistance + 0.5) {
      return {
        x: point.x + dx * 0.35,
        y: point.y + dy * 0.35,
      }
    }

    const ratio = insetDistance / distance

    return {
      x: point.x + dx * ratio,
      y: point.y + dy * ratio,
    }
  })
}

function dedupeRoutePoints(points: Vec2[]): Vec2[] {
  return points.filter((point, index) => {
    if (index === 0) {
      return true
    }

    return distanceBetween2D(points[index - 1], point) > 0.8
  })
}

function distanceBetween(
  start: Pick<MissionWaypoint, 'x' | 'y' | 'z'>,
  end: Pick<MissionWaypoint, 'x' | 'y' | 'z'>,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const dz = end.z - start.z

  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function distanceBetween2D(
  start: Pick<Vec2, 'x' | 'y'>,
  end: Pick<Vec2, 'x' | 'y'>,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y

  return Math.sqrt(dx * dx + dy * dy)
}

function getStableMissionCenter(points: XYPoint[]): Vec2 {
  const centroid = polygonCentroid(points)

  if (isPointInPolygon(centroid, points)) {
    return centroid
  }

  const bounds = getPointBounds(points)

  return {
    x: bounds.minX + bounds.width / 2,
    y: bounds.minY + bounds.height / 2,
  }
}

function getPointBounds(points: Array<Pick<MissionPoint, 'x' | 'y'>>) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function isPointInPolygon(
  point: Pick<Vec2, 'x' | 'y'>,
  polygon: Array<Pick<MissionPoint, 'x' | 'y'>>,
): boolean {
  let inside = false

  for (
    let left = 0, right = polygon.length - 1;
    left < polygon.length;
    right = left, left += 1
  ) {
    const leftPoint = polygon[left]
    const rightPoint = polygon[right]
    const intersects =
      leftPoint.y > point.y !== rightPoint.y > point.y &&
      point.x <
        ((rightPoint.x - leftPoint.x) * (point.y - leftPoint.y)) /
          (rightPoint.y - leftPoint.y) +
          leftPoint.x

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function rotatePoint(
  point: Pick<Vec2, 'x' | 'y'>,
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

function ensureClockwise(points: XYPoint[]): XYPoint[] {
  return getSignedPolygonArea(points) > 0 ? [...points].reverse() : [...points]
}

function ensureCounterClockwise(points: XYPoint[]): XYPoint[] {
  return getSignedPolygonArea(points) < 0 ? [...points].reverse() : [...points]
}

function getSignedPolygonArea(points: XYPoint[]): number {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return area / 2
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max))
}
