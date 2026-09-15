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

  it('doubling thickness (0.9 vs the 0.45 default) doubles the front/back z offsets', () => {
    // The demo's ThicknessSlider ships a "1.0" reading — this pins the same
    // ratio the slider relies on: the faces spread apart linearly with
    // thickness, they don't stay pinned to the default.
    const base = computeCoinFaces(0.45)
    const doubled = computeCoinFaces(0.9)
    expect(doubled.front.position[2]).toBeCloseTo(base.front.position[2] * 2)
    expect(doubled.back.position[2]).toBeCloseTo(base.back.position[2] * 2)
  })
})
