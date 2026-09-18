import { describe, expect, it } from 'vitest'
import { BackSide, FrontSide } from 'three'
import { SEAM_WINDOW, computeCoinFaces, computeSeamLayout, seamShare } from './coinFaces'

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

const deg = (d: number) => (d * Math.PI) / 180

describe('seamShare', () => {
  it('gives the side facing the camera the whole thickness', () => {
    expect(seamShare(0)).toBe(1)
    expect(seamShare(deg(55))).toBe(1)
    expect(seamShare(deg(125))).toBe(0)
    expect(seamShare(deg(180))).toBe(0)
    expect(seamShare(deg(-40))).toBe(1)
  })

  it('splits the thickness evenly at edge-on, from either direction', () => {
    expect(seamShare(deg(90))).toBeCloseTo(0.5)
    expect(seamShare(deg(270))).toBeCloseTo(0.5)
  })

  it('never jumps: a 1° step moves the seam by a few percent at most (issue #53)', () => {
    let worst = 0
    for (let d = 0; d < 360; d++) worst = Math.max(worst, Math.abs(seamShare(deg(d + 1)) - seamShare(deg(d))))
    expect(worst).toBeLessThan(0.05)
  })

  it('is flat where the window opens, so the seam starts moving gently', () => {
    const open = Math.acos(SEAM_WINDOW)
    expect(seamShare(open - deg(1))).toBe(1)
    expect(1 - seamShare(open + deg(1))).toBeLessThan(0.005)
  })
})

describe('computeSeamLayout', () => {
  it('front owns the full thickness when share is 1; the back and caps are hidden', () => {
    const l = computeSeamLayout(1, 0.45)
    expect(l.front).toEqual({ visible: true, scaleZ: 1, positionZ: 0 })
    expect(l.back.visible).toBe(false)
    expect(l.back.scaleZ).toBeGreaterThan(0) // never a singular matrix
    expect(l.capsVisible).toBe(false)
    expect(l.seamZ).toBeCloseTo(-0.225)
  })

  it('mirrors that when share is 0', () => {
    const l = computeSeamLayout(0, 0.45)
    expect(l.front.visible).toBe(false)
    expect(l.front.scaleZ).toBeGreaterThan(0)
    expect(l.back.visible).toBe(true)
    expect(l.back.scaleZ).toBe(1)
    expect(l.back.positionZ).toBeCloseTo(0)
    expect(l.seamZ).toBeCloseTo(0.225)
  })

  it('at an even split the two rims meet at z = 0 and tile the thickness exactly', () => {
    const t = 0.45
    const l = computeSeamLayout(0.5, t)
    expect(l.seamZ).toBeCloseTo(0)
    expect(l.capsVisible).toBe(true)
    // front spans [seamZ, +half], back spans [-half, seamZ]
    expect(l.front.positionZ - (l.front.scaleZ * t) / 2).toBeCloseTo(l.seamZ)
    expect(l.front.positionZ + (l.front.scaleZ * t) / 2).toBeCloseTo(t / 2)
    expect(l.back.positionZ + (l.back.scaleZ * t) / 2).toBeCloseTo(l.seamZ)
    expect(l.back.positionZ - (l.back.scaleZ * t) / 2).toBeCloseTo(-t / 2)
  })
})
