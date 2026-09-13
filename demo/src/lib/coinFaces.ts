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
