import { describe, expect, it } from 'vitest'
import type { ExclusionZone, MissionPoint } from '../store/useMissionStore'
import {
  getExclusionZoneValidationIssues,
  getPolygonPlacementAgainstBoundary,
  polygonsOverlap,
} from './exclusionValidation'

function point(id: number, x: number, y: number): MissionPoint {
  return { id, x, y }
}

function zone(
  id: number,
  label: string,
  points: MissionPoint[],
  enabled = true,
): ExclusionZone {
  return {
    id,
    label,
    points,
    enabled,
  }
}

describe('exclusion validation', () => {
  const boundary = [
    point(1, -40, -40),
    point(2, 40, -40),
    point(3, 40, 40),
    point(4, -40, 40),
  ]

  it('classifies polygons that sit fully outside the boundary', () => {
    const placement = getPolygonPlacementAgainstBoundary(
      [
        point(1, 60, 60),
        point(2, 80, 60),
        point(3, 80, 80),
      ],
      boundary,
    )

    expect(placement).toBe('outside')
  })

  it('detects overlap between exclusion polygons', () => {
    expect(
      polygonsOverlap(
        [
          point(1, -10, -10),
          point(2, 10, -10),
          point(3, 10, 10),
          point(4, -10, 10),
        ],
        [
          point(1, 0, -15),
          point(2, 15, -15),
          point(3, 15, 15),
          point(4, 0, 15),
        ],
      ),
    ).toBe(true)
  })

  it('returns outside and overlap warnings for invalid zones', () => {
    const subject = zone(1, 'Excluded area 1', [
      point(1, 55, 55),
      point(2, 75, 55),
      point(3, 75, 75),
      point(4, 55, 75),
    ])
    const other = zone(2, 'Excluded area 2', [
      point(1, 60, 60),
      point(2, 82, 60),
      point(3, 82, 82),
      point(4, 60, 82),
    ])

    const issues = getExclusionZoneValidationIssues({
      zone: subject,
      boundaryPoints: boundary,
      otherZones: [other],
      lineSpacing: 10,
    })

    expect(issues.some((issue) => issue.code === 'outside-boundary')).toBe(true)
    expect(issues.some((issue) => issue.code === 'overlaps-zone')).toBe(true)
  })
})
