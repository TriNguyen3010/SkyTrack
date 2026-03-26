export type FlightPatternId =
  | 'coverage'
  | 'perimeter'
  | 'orbit'
  | 'spiral'
  | 'grid'
  | 'corridor'

export interface FlightPatternOption {
  id: FlightPatternId
  label: string
  shortLabel: string
  description: string
  color: string
  implemented: boolean
}

export const FLIGHT_PATTERN_OPTIONS: FlightPatternOption[] = [
  {
    id: 'coverage',
    label: 'Coverage Scan',
    shortLabel: 'Coverage Area Scan',
    description: 'Automated lawnmower coverage across the full polygon.',
    color: '#8b5cf6',
    implemented: true,
  },
  {
    id: 'perimeter',
    label: 'Perimeter',
    shortLabel: 'Perimeter Scan',
    description: 'Follow the outer boundary of the region.',
    color: '#f97316',
    implemented: false,
  },
  {
    id: 'orbit',
    label: 'Orbit / POI',
    shortLabel: 'Orbit / POI',
    description: 'Circle around a target area or point of interest.',
    color: '#f59e0b',
    implemented: false,
  },
  {
    id: 'spiral',
    label: 'Spiral',
    shortLabel: 'Spiral Scan',
    description: 'Sweep inward with a spiral path from the boundary.',
    color: '#10b981',
    implemented: false,
  },
  {
    id: 'grid',
    label: 'Grid',
    shortLabel: 'Grid Scan',
    description: 'Cross-hatch the area with an orthogonal grid.',
    color: '#ec4899',
    implemented: false,
  },
  {
    id: 'corridor',
    label: 'Corridor',
    shortLabel: 'Corridor Scan',
    description: 'Run a centered corridor-style flight path.',
    color: '#06b6d4',
    implemented: false,
  },
]

export function getFlightPatternOption(
  patternId: FlightPatternId,
): FlightPatternOption {
  return (
    FLIGHT_PATTERN_OPTIONS.find((pattern) => pattern.id === patternId) ??
    FLIGHT_PATTERN_OPTIONS[0]
  )
}
