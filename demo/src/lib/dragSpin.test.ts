import { describe, expect, it } from 'vitest'
import { MAX_FLING, MAX_TILT, RAD_PER_PX, stepSpin, type SpinState } from './dragSpin'

const rest: SpinState = { angle: 0, velocity: 0, tilt: 0 }
const idle = { dragging: false, dx: 0, dyTotal: 0, baseSpeed: 0.35 }

describe('stepSpin', () => {
  it('auto-spins at the base speed when untouched', () => {
    expect(stepSpin(rest, idle, 0.05).angle).toBeCloseTo(0.35 * 0.05)
  })

  it('follows the pointer 1:1 while held, with auto-spin suspended', () => {
    const s = stepSpin(rest, { ...idle, dragging: true, dx: 50 }, 0.016)
    expect(s.angle).toBeCloseTo(50 * RAD_PER_PX)
  })

  it('a flick keeps spinning after release, then decays back to auto-spin', () => {
    let s = rest
    for (let i = 0; i < 5; i++) s = stepSpin(s, { ...idle, dragging: true, dx: 20 }, 0.016)
    expect(s.velocity).toBeGreaterThan(5)
    const released = stepSpin(s, idle, 0.016)
    expect(released.angle - s.angle).toBeGreaterThan(0.35 * 0.016 * 5)
    let later = released
    for (let i = 0; i < 300; i++) later = stepSpin(later, idle, 0.016)
    expect(Math.abs(later.velocity)).toBeLessThan(0.05)
  })

  it('holding still before release does not fling', () => {
    let s = stepSpin(rest, { ...idle, dragging: true, dx: 40 }, 0.016)
    for (let i = 0; i < 20; i++) s = stepSpin(s, { ...idle, dragging: true, dx: 0 }, 0.016)
    expect(Math.abs(s.velocity)).toBeLessThan(0.1)
  })

  it('clamps fling speed and tilt', () => {
    const s = stepSpin(rest, { ...idle, dragging: true, dx: 5000, dyTotal: 5000 }, 0.1)
    expect(s.velocity).toBeLessThanOrEqual(MAX_FLING)
    let t = s
    for (let i = 0; i < 100; i++) t = stepSpin(t, { ...idle, dragging: true, dx: 0, dyTotal: 5000 }, 0.016)
    expect(t.tilt).toBeCloseTo(MAX_TILT, 2)
  })

  it('tilt springs back to flat after release', () => {
    let s: SpinState = { ...rest, tilt: MAX_TILT }
    for (let i = 0; i < 100; i++) s = stepSpin(s, idle, 0.016)
    expect(Math.abs(s.tilt)).toBeLessThan(0.001)
  })
})
