import {
  generateCoverageSegments,
  generateCoverageWaypoints,
  polygonCentroid,
  type Vec2,
} from './missionGeometry'
import type { MissionPoint, MissionWaypoint } from '../store/useMissionStore'

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
  scanAltitude: number
  lineSpacing: number
  orientation: number
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
    implemented: false,
    defaultParams: {
      spiralDirection: 'inward',
      armSpacing: 12,
      rotationDirection: 'cw',
      scanAltitude: 40,
    },
  },
  grid: {
    id: 'grid',
    label: 'Grid',
    shortLabel: 'Grid Scan',
    description: 'Cross-hatch the area with an orthogonal grid.',
    color: '#ec4899',
    implemented: false,
    defaultParams: {
      lineSpacing: 10,
      orientation: 0,
      crossAngle: 90,
      scanAltitude: 40,
    },
  },
  corridor: {
    id: 'corridor',
    label: 'Corridor',
    shortLabel: 'Corridor Scan',
    description: 'Run a centered corridor-style flight path.',
    color: '#06b6d4',
    implemented: false,
    defaultParams: {
      passes: 1,
      passSpacing: 10,
      direction: 'auto',
      scanAltitude: 40,
    },
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

function generateCoverageMission({
  points,
  scanAltitude,
  lineSpacing,
  orientation,
}: FlightPatternBuildContext): FlightPatternMissionResult {
  const segments = generateCoverageSegments(points, lineSpacing, orientation)
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
  scanAltitude,
}: FlightPatternBuildContext): FlightPatternMissionResult {
  const direction: PerimeterPatternParams['direction'] = 'cw'
  const loops = 1
  const orderedBoundary = getPerimeterRing(points, direction)
  const perimeterSegments = orderedBoundary.slice(1).map((point, index) => [
    orderedBoundary[index],
    point,
  ] as [Vec2, Vec2])
  const waypoints = orderedBoundary.map((point, index) => ({
    id: index + 1,
    x: Math.round(point.x * 100) / 100,
    y: Math.round(point.y * 100) / 100,
    z: scanAltitude,
    actions: [],
  }))

  return {
    patternId: 'perimeter',
    segments: perimeterSegments,
    waypoints,
    closed: true,
    meta: {
      estimatedLength: estimateWaypointPathLength(waypoints),
      loops,
      direction: direction.toUpperCase(),
    },
  }
}

function generateOrbitMission({
  points,
  scanAltitude,
}: FlightPatternBuildContext): FlightPatternMissionResult {
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

  const center = polygonCentroid(points)
  const radius = getAutoOrbitRadius(points, center)
  const waypointCount = 24
  const loops = 1
  const direction: OrbitPatternParams['direction'] = 'cw'
  const ring = buildOrbitRing({
    center,
    radius,
    waypointCount,
    direction,
  })
  const segments = ring.slice(1).map((point, index) => [
    ring[index],
    point,
  ] as [Vec2, Vec2])
  const waypoints = ring.map((point, index) => ({
    id: index + 1,
    x: Math.round(point.x * 100) / 100,
    y: Math.round(point.y * 100) / 100,
    z: scanAltitude,
    actions: [],
  }))

  return {
    patternId: 'orbit',
    segments,
    waypoints,
    closed: true,
    meta: {
      estimatedLength: estimateWaypointPathLength(waypoints),
      loops,
      direction: direction.toUpperCase(),
    },
  }
}

function getPerimeterRing(
  points: MissionPoint[],
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

function estimateWaypointPathLength(waypoints: MissionWaypoint[]): number {
  let total = 0

  for (let index = 1; index < waypoints.length; index += 1) {
    total += distanceBetween(waypoints[index - 1], waypoints[index])
  }

  return Math.round(total * 100) / 100
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

function ensureClockwise(points: MissionPoint[]): MissionPoint[] {
  return getSignedPolygonArea(points) > 0 ? [...points].reverse() : [...points]
}

function ensureCounterClockwise(points: MissionPoint[]): MissionPoint[] {
  return getSignedPolygonArea(points) < 0 ? [...points].reverse() : [...points]
}

function getSignedPolygonArea(points: MissionPoint[]): number {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return area / 2
}
