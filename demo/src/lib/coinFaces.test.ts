import { describe, expect, it } from 'vitest'
import { BackSide, FrontSide } from 'three'
import { FLIP_WINDOW, computeCoinFaces, flipScale } from './coinFaces'

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

describe('flipScale', () => {
  it('is +1 face-on and -1 at the opposite face-on pose', () => {
    expect(flipScale(0)).toBeCloseTo(1)
    expect(flipScale(deg(180))).toBeCloseTo(-1)
    expect(flipScale(deg(-180))).toBeCloseTo(-1)
  })

  it('is 0 at edge-on, from either direction', () => {
    expect(flipScale(deg(90))).toBeCloseTo(0)
    expect(flipScale(deg(270))).toBeCloseTo(0)
    expect(flipScale(deg(-90))).toBeCloseTo(0)
  })

  it('is an odd function of cos(yaw): mirrored yaws give mirrored scales', () => {
    // cos(180 - a) = -cos(a), so these two yaws feed flipScale opposite s.
    for (const a of [10, 40, 70, 85]) {
      expect(flipScale(deg(a))).toBeCloseTo(-flipScale(deg(180 - a)))
    }
  })

  it('is flat where the window opens, so the squeeze starts gently', () => {
    const open = Math.acos(FLIP_WINDOW)
    expect(flipScale(open - deg(0.5))).toBeCloseTo(1)
    expect(1 - flipScale(open + deg(0.5))).toBeLessThan(0.01)
  })

  it('is monotonically decreasing as yaw sweeps 0 to 180 degrees', () => {
    let prev = flipScale(0)
    for (let d = 1; d <= 180; d++) {
      const curr = flipScale(deg(d))
      expect(curr).toBeLessThanOrEqual(prev + 1e-9)
      prev = curr
    }
  })

  it('never jumps: a half-degree step moves the scale by a few percent at most (issue #53)', () => {
    let worst = 0
    for (let d = 0; d < 720; d++) worst = Math.max(worst, Math.abs(flipScale(deg((d + 1) / 2)) - flipScale(deg(d / 2))))
    expect(worst).toBeLessThan(0.07)
  })
})
