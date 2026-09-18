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
 * Text logos are built BACK TO BACK: a second, x-mirrored logo (face, outline
 * and rim together) is glued behind the first, so text reads correctly from
 * both sides and the coin spins continuously. The old approach — wrapping the
 * yaw so the front always faced the camera — snapped 180° at edge-on, which
 * swaps the rim wall in view and visibly pops on any logo that is not
 * perfectly symmetric (issue #53).
 *
 * The seam between the two logos SLIDES with the turn: whichever side faces
 * the camera owns the whole thickness, so only its own outline shows behind
 * it. The two share the thickness only while |cos yaw| < SEAM_WINDOW.
 */
export const SEAM_WINDOW = 0.34 // ~70°–110°: the hand-over window around edge-on
export const SEAM_MIN = 0.002 // a side thinner than this share is hidden, never scaled to 0

/**
 * The FRONT logo's share of the thickness for a yaw (1 = all of it, 0 = none).
 * An odd smoothstep in cos(yaw): flat at both ends of the window and exactly
 * 0.5 at edge-on, so the seam starts and stops gently and no single frame
 * changes the rim's shape at once.
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

export interface SeamLayout {
  front: SeamSide
  back: SeamSide
  /** z of the seam — where the two mid-plane caps sit. */
  seamZ: number
  /** Caps are only needed while both sides have thickness. */
  capsVisible: boolean
}

/** Where each side's rim and the seam caps go for a given share (see seamShare). */
export function computeSeamLayout(share: number, thickness: number): SeamLayout {
  const half = thickness / 2
  const seamZ = half - share * thickness
  const front: SeamSide = {
    visible: share > SEAM_MIN,
    scaleZ: Math.max(share, SEAM_MIN),
    positionZ: (half + seamZ) / 2,
  }
  const back: SeamSide = {
    visible: share < 1 - SEAM_MIN,
    scaleZ: Math.max(1 - share, SEAM_MIN),
    positionZ: (seamZ - half) / 2,
  }
  return { front, back, seamZ, capsVisible: front.visible && back.visible }
}
