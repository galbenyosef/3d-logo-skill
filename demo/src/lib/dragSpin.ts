/**
 * Drag-to-spin physics for the coin, kept pure so it can be unit-tested.
 * While held, horizontal drag turns the coin 1:1 with the pointer and the
 * auto-spin stops; on release the fling velocity decays back into the
 * normal auto-spin. Vertical drag adds a small tilt that springs back.
 */

export const RAD_PER_PX = 0.012
export const MAX_FLING = 12 // rad/s
export const FLING_FRICTION = 2.2 // 1/s — exponential decay of the fling
export const MAX_TILT = 0.26 // ~15°
export const TILT_PER_PX = 0.003
const TILT_STIFFNESS = 10
const VELOCITY_TRACKING = 20
const MAX_DELTA = 0.1

export interface SpinState {
  angle: number
  /** Extra angular velocity on top of the auto-spin (rad/s). */
  velocity: number
  tilt: number
}

export interface DragInput {
  dragging: boolean
  /** Horizontal pointer movement since the previous frame (px). */
  dx: number
  /** Vertical pointer offset since the drag started (px). */
  dyTotal: number
  /** Auto-spin speed (rad/s), already scaled by pause/reduced motion. */
  baseSpeed: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function stepSpin(state: SpinState, input: DragInput, rawDelta: number): SpinState {
  const delta = clamp(rawDelta, 0, MAX_DELTA)
  let { angle, velocity, tilt } = state

  if (input.dragging) {
    const dAngle = input.dx * RAD_PER_PX
    angle += dAngle
    // Track the pointer's recent speed so a quick flick flings and a
    // hold-still-then-release doesn't.
    const instant = delta > 0 ? dAngle / delta : 0
    velocity += (instant - velocity) * (1 - Math.exp(-VELOCITY_TRACKING * delta))
  } else {
    angle += (input.baseSpeed + velocity) * delta
    velocity *= Math.exp(-FLING_FRICTION * delta)
  }
  velocity = clamp(velocity, -MAX_FLING, MAX_FLING)

  const tiltTarget = input.dragging ? clamp(input.dyTotal * TILT_PER_PX, -MAX_TILT, MAX_TILT) : 0
  tilt += (tiltTarget - tilt) * (1 - Math.exp(-TILT_STIFFNESS * delta))

  return { angle, velocity, tilt }
}
