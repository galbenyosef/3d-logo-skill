import { describe, expect, it } from 'vitest'
import { BackSide, FrontSide } from 'three'
import { computeCoinFaces } from './coinFaces'

describe('computeCoinFaces', () => {
  it('places the front face at +half with no rotation and FrontSide', () => {
    const { front } = computeCoinFaces(0.45)
    expect(front.position).toEqual([0, 0, 0.225])
    expect(front.rotationY).toBe(0)
    expect(front.side).toBe(FrontSide)
  })

  it('places the back face at -half with no rotation and BackSide (issue #11 regression guard)', () => {
    // The back face must be the same plane seen from behind, not a mirrored
    // copy: no Y rotation, so its silhouette matches the rim's outline
    // exactly instead of a reversed one on asymmetric logos.
    const { back } = computeCoinFaces(0.45)
    expect(back.position).toEqual([0, 0, -0.225])
    expect(back.rotationY).toBe(0)
    expect(back.side).toBe(BackSide)
  })

  it('scales half-thickness with the thickness argument', () => {
    const { front, back } = computeCoinFaces(1)
    expect(front.position[2]).toBeCloseTo(0.5)
    expect(back.position[2]).toBeCloseTo(-0.5)
  })
})
