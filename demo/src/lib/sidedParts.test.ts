import { describe, expect, it } from 'vitest'
import { MIRROR_OVERLAP_MIN, mirrorOverlap, splitSidedParts, type Point } from './sidedParts'

const box = (x0: number, x1: number): Point[] => [
  [x0, -0.1],
  [x1, -0.1],
  [x1, 0.1],
  [x0, 0.1],
]

describe('splitSidedParts', () => {
  it('keeps parts centred on the mirror axis on a single rim', () => {
    const emblem = box(-0.4, 0.4)
    const middleLetter = box(-0.05, 0.05)
    const { centred, sided } = splitSidedParts([emblem, middleLetter])
    expect(centred).toEqual([emblem, middleLetter])
    expect(sided).toEqual([])
  })

  it('gives parts beside the axis their own mirrored rim', () => {
    const left = box(-0.35, -0.2)
    const right = box(0.2, 0.35)
    const { centred, sided } = splitSidedParts([left, right])
    expect(centred).toEqual([])
    expect(sided).toEqual([left, right])
  })

  it('gives a centred but asymmetric part its own mirrored rim', () => {
    // A right triangle across the full width: the bbox is centred, the shape is not.
    const wedge: Point[] = [
      [-0.4, -0.3],
      [0.4, -0.3],
      [0.4, 0.3],
    ]
    expect(mirrorOverlap(wedge)).toBeLessThan(MIRROR_OVERLAP_MIN)
    expect(splitSidedParts([wedge]).sided).toHaveLength(1)
  })
})

describe('mirrorOverlap', () => {
  it('is 1 for a symmetric centred part and 0 for a part fully off the axis', () => {
    expect(mirrorOverlap(box(-0.3, 0.3))).toBeCloseTo(1, 1)
    expect(mirrorOverlap(box(0.1, 0.3))).toBe(0)
  })

  it('falls as the part moves off the axis', () => {
    const slight = mirrorOverlap(box(-0.42, 0.4))
    const more = mirrorOverlap(box(-0.3, 0.4))
    expect(slight).toBeGreaterThan(more)
    expect(slight).toBeGreaterThan(MIRROR_OVERLAP_MIN)
  })

  it('survives a degenerate loop', () => {
    expect(mirrorOverlap([])).toBe(0)
    expect(mirrorOverlap([[0, 0]])).toBe(0)
  })
})
