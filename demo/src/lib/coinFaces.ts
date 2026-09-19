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
 * correctly from behind, and the coin spins continuously. Parts that land on
 * their own rim when mirrored keep ONE rim (./sidedParts); only the other
 * parts get a second, mirrored rim. The seam between a sided part's two rims
 * SLIDES with the turn: the rim facing the camera owns the whole thickness,
 * and the two share it only in a narrow window right at edge-on.
 *
 * Tried and dropped: wrapping the yaw so the front always faced the camera
 * (the 180° snap at edge-on swaps the rim wall in view and pops, issue #53),
 * and mirroring the WHOLE rim with a wide window (its seam showed on the big
 * walls exactly when they were in view).
 */
export const SEAM_WINDOW = 0.12 // |cos yaw| below this (~83°–97°): a sided part's two rims share the thickness
export const SEAM_MIN = 0.002 // a rim thinner than this share is hidden, never scaled to 0

/**
 * The FRONT rim's share of the thickness for a yaw (1 = all of it, 0 = none).
 * An odd smoothstep in cos(yaw): flat at both ends of the window and exactly
 * 0.5 at edge-on, so the seam starts and stops gently and no single frame
 * changes a wall's shape at once.
 */
export function seamShare(yaw: number): number {
  const s = Math.min(Math.max(Math.cos(yaw) / SEAM_WINDOW, -1), 1)
  return 0.5 + 0.5 * s * (1.5 - 0.5 * s * s)
}

export interface SeamSide {
  visible: boolean
  /** z scale for a rim built at FULL thickness, centred on z = 0. */
  scaleZ: number
  positionZ: number
}

/** Where a sided part's front and back rims go for a given share (see seamShare). */
export function computeSeamLayout(share: number, thickness: number): { front: SeamSide; back: SeamSide } {
  const half = thickness / 2
  const seamZ = half - share * thickness
  return {
    front: { visible: share > SEAM_MIN, scaleZ: Math.max(share, SEAM_MIN), positionZ: (half + seamZ) / 2 },
    back: { visible: share < 1 - SEAM_MIN, scaleZ: Math.max(1 - share, SEAM_MIN), positionZ: (seamZ - half) / 2 },
  }
}
