import { describe, expect, it } from 'vitest'
import type { ExclusionZone, MissionPoint } from '../store/useMissionStore'
import {
  clipSegmentAgainstPolygon,
  clipSegmentsAgainstExclusions,
  isPointInAnyExclusion,
  isPointInPolygon,
} from './exclusionGeometry'

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

describe('exclusion geometry', () => {
  const square = [
    point(1, -10, -10),
    point(2, 10, -10),
    point(3, 10, 10),
    point(4, -10, 10),
  ]

  it('treats points on exclusion edges as outside', () => {
    expect(isPointInPolygon({ x: 0, y: 0 }, square)).toBe(true)
    expect(isPointInPolygon({ x: 10, y: 0 }, square)).toBe(false)
  })

  it('clips a segment that passes through an exclusion polygon', () => {
    const clipped = clipSegmentAgainstPolygon(
      [{ x: -20, y: 0 }, { x: 20, y: 0 }],
      square,
    )

    expect(clipped).toHaveLength(2)
    expect(clipped[0]).toEqual([{ x: -20, y: 0 }, { x: -10, y: 0 }])
    expect(clipped[1]).toEqual([{ x: 10, y: 0 }, { x: 20, y: 0 }])
  })

  it('keeps a segment that only touches an exclusion edge', () => {
    const clipped = clipSegmentAgainstPolygon(
      [{ x: -20, y: 10 }, { x: 20, y: 10 }],
      square,
    )

    expect(clipped).toEqual([[{ x: -20, y: 10 }, { x: 20, y: 10 }]])
  })

  it('clips segments sequentially across multiple enabled zones', () => {
    const clipped = clipSegmentsAgainstExclusions(
      [[{ x: -30, y: 0 }, { x: 30, y: 0 }]],
      [
        zone(1, 'A', square),
        zone(2, 'B', [
          point(1, 14, -6),
          point(2, 24, -6),
          point(3, 24, 6),
          point(4, 14, 6),
        ]),
      ],
    )

    expect(clipped).toHaveLength(3)
    expect(clipped[0]).toEqual([{ x: -30, y: 0 }, { x: -10, y: 0 }])
    expect(clipped[1]).toEqual([{ x: 10, y: 0 }, { x: 14, y: 0 }])
    expect(clipped[2]).toEqual([{ x: 24, y: 0 }, { x: 30, y: 0 }])
  })

  it('detects points inside any enabled exclusion zone', () => {
    expect(
      isPointInAnyExclusion(
        { x: 0, y: 0 },
        [zone(1, 'A', square), zone(2, 'B', square, false)],
      ),
    ).toBe(true)
    expect(
      isPointInAnyExclusion(
        { x: 15, y: 15 },
        [zone(1, 'A', square), zone(2, 'B', square, false)],
      ),
    ).toBe(false)
  })
})
