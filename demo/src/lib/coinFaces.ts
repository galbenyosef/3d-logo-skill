import { BackSide, FrontSide, type Side } from 'three'

export interface CoinFace {
  position: readonly [number, number, number]
  side: Side
  /**
   * Y-axis rotation in radians. Must stay 0 on both faces — the back face is
   * the same plane seen from behind (`BackSide`), not a mirrored copy of the
   * front. Rotating it by PI makes the back logo "readable" but mirrors its
   * silhouette against the rim, which showed on every asymmetric logo
   * (issue #11, fixed on this branch).
   */
  rotationY: number
}

export interface CoinFaces {
  front: CoinFace
  back: CoinFace
}

/**
 * Pure placement math for the coin's two faces, extracted out of
 * SpinningLogo3D.tsx so the back-face regression (issue #11: no rotation,
 * `BackSide`, pushed to `-half`) has a small unit-testable surface instead
 * of only being checkable by eye in the rendered scene.
 */
export function computeCoinFaces(thickness: number): CoinFaces {
  const half = thickness / 2
  return {
    front: { position: [0, 0, half], side: FrontSide, rotationY: 0 },
    back: { position: [0, 0, -half], side: BackSide, rotationY: 0 },
  }
}

/**
 * Text logos: the back face is the art mirrored in x so the text reads
 * correctly from behind, and the coin spins continuously. The rim is ONE
 * whole outline built from every part — never split by symmetry — because a
 * two-part rim (a real outline plus a second, mirrored one swapped in for
 * the asymmetric parts) shows a stepped wall at edge-on: half one outline,
 * half its mirror, exactly when it's in view.
 *
 * Instead the whole coin narrows through edge-on ("edge squeeze"): every
 * frame, `flipScale(yaw)` gives an x scale that is +1 while the front faces
 * the camera, -1 (the mirrored outline) while the back does, and an odd
 * smoothstep through 0 at edge-on — flat at both ends, so the squeeze starts
 * and ends without a jolt. The faces take `Math.abs(m)` (never mirrored by
 * this scale — the back face is already mirrored on its own), and the rim
 * takes the sign, so it is the front outline before edge-on and its mirror
 * after: always one whole outline, never a step.
 *
 * Tried and dropped: wrapping the yaw so the front always faced the camera
 * (the 180° snap at edge-on swaps the rim wall in view and pops, issue #53),
 * and splitting the rim by symmetry with a sliding seam (the two-part wall
 * above, issue #60).
 */
export const FLIP_WINDOW = 0.2 // |cos yaw| below this (~78°–102°) the coin narrows through edge-on
export const FLIP_MIN = 0.02 // narrowest x scale — never 0 (singular matrix), wide enough to avoid z-fighting of collapsed walls

/**
 * The coin's x scale for a yaw: +1 face-on, -1 the opposite face-on, an odd
 * smoothstep in cos(yaw) through 0 at edge-on. Flat at both ends of the
 * window, so the squeeze starts and stops gently and no single frame snaps
 * the shape.
 */
export function flipScale(yaw: number): number {
  const s = Math.min(Math.max(Math.cos(yaw) / FLIP_WINDOW, -1), 1)
  return s * (1.5 - 0.5 * s * s)
}
