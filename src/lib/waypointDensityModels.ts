import type { Vec2 } from './missionGeometry'

export type WaypointRole = 'anchor' | 'intermediate'

export interface WaypointDensityConfig {
  mode: 'auto' | 'count' | 'spacing' | 'simplify'
  targetCount: number | null
  targetSpacing: number | null
  simplifyTolerance?: number | null
  protectActioned?: boolean
}

export interface PathSegment {
  fromAnchorId: number
  toAnchorId: number
  length: number
  direction: Vec2
}

export interface WaypointDensityConstraints {
  minSpacing: number
  maxWaypoints: number | null
  minimumWaypointCount?: number
  isClosedLoop?: boolean
}

export interface WaypointDensityMetrics {
  anchorCount: number
  intermediateCount: number
  totalCount: number
  effectiveSpacing: number | null
  totalPathLength: number
  minimumCount: number
  maximumCount: number | null
}

export const DEFAULT_WAYPOINT_DENSITY_CONFIG: WaypointDensityConfig = {
  mode: 'auto',
  targetCount: null,
  targetSpacing: null,
  simplifyTolerance: null,
  protectActioned: true,
}

export const DEFAULT_WAYPOINT_DENSITY_CONSTRAINTS: WaypointDensityConstraints = {
  minSpacing: 2,
  maxWaypoints: null,
  minimumWaypointCount: 2,
  isClosedLoop: false,
}
