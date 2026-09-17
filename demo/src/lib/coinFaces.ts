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
 * Text-logo yaw: wraps an accumulated spin angle into [-PI/2, PI/2) so the
 * front face always faces the camera. The coin snaps 180° exactly when it is
 * edge-on, so text never reads mirrored and the back face's true-mirror
 * silhouette is never shown. The two edge-on views are NOT visually
 * identical — the snap swaps which side of the rim's thickness faces the
 * camera, and on an asymmetric logo under perspective that swap visibly
 * pops (issue #53). Pair this with `edgeThinScale` to thin the coin toward
 * the snap so it lands on a hairline instead of a visible face-width.
 */
export function wrapFrontYaw(angle: number): number {
  return ((((angle + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2
}

/** Text logos: |cos yaw| below this (~65°+ from face-on) thins the coin toward edge-on. */
export const EDGE_THIN_WINDOW = 0.42
/** Never scale to 0 — a singular matrix NaNs the rim normals. */
export const EDGE_THIN_MIN = 0.02

/**
 * Scale factor for the coin's Z thickness as it approaches edge-on, so the
 * yaw snap in `wrapFrontYaw` lands on a hairline instead of a visible
 * face-width (issue #53). Smoothstepped (3t² - 2t³) for a continuous,
 * monotonic-ish falloff inside the window; outside it the coin stays at
 * full thickness.
 */
export function edgeThinScale(yaw: number): number {
  const t = Math.min(Math.abs(Math.cos(yaw)) / EDGE_THIN_WINDOW, 1)
  return Math.max(EDGE_THIN_MIN, t * t * (3 - 2 * t))
}
