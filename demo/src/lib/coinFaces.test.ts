import { describe, expect, it } from 'vitest'
import { BackSide, FrontSide } from 'three'
import { computeCoinFaces, edgeThinScale, EDGE_THIN_MIN, wrapFrontYaw } from './coinFaces'

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

describe('wrapFrontYaw', () => {
  it('keeps the front face toward the camera, snapping only at edge-on', () => {
    const deg = (d: number) => (d * Math.PI) / 180
    expect(wrapFrontYaw(deg(45))).toBeCloseTo(deg(45))
    expect(wrapFrontYaw(deg(89))).toBeCloseTo(deg(89))
    expect(wrapFrontYaw(deg(91))).toBeCloseTo(deg(-89))
    expect(wrapFrontYaw(deg(180))).toBeCloseTo(0)
    expect(wrapFrontYaw(deg(-100))).toBeCloseTo(deg(80))
  })
})

describe('edgeThinScale', () => {
  it('is 1 at face-on (yaw 0)', () => {
    expect(edgeThinScale(0)).toBeCloseTo(1)
  })

  it('clamps to EDGE_THIN_MIN at edge-on (±90°)', () => {
    const deg = (d: number) => (d * Math.PI) / 180
    expect(edgeThinScale(deg(90))).toBeCloseTo(EDGE_THIN_MIN)
    expect(edgeThinScale(deg(-90))).toBeCloseTo(EDGE_THIN_MIN)
  })

  it('falls off continuously and monotonic-ish approaching the window edge', () => {
    const deg = (d: number) => (d * Math.PI) / 180
    const far = edgeThinScale(deg(50))
    const nearer = edgeThinScale(deg(70))
    const closer = edgeThinScale(deg(80))
    const closest = edgeThinScale(deg(89))
    expect(far).toBeCloseTo(1)
    expect(nearer).toBeLessThanOrEqual(far)
    expect(closer).toBeLessThanOrEqual(nearer)
    expect(closest).toBeLessThanOrEqual(closer)
  })

  it('is equal (and near the snap) at +89.9° and -89.9° so the pop lands on a hairline', () => {
    const deg = (d: number) => (d * Math.PI) / 180
    const plus = edgeThinScale(deg(89.9))
    const minus = edgeThinScale(deg(-89.9))
    expect(plus).toBeCloseTo(minus)
    expect(plus).toBeCloseTo(EDGE_THIN_MIN, 2)
  })
})
