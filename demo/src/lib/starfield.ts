import { mulberry32 } from './prng'

const VIEWBOX_WIDTH = 1600
const VIEWBOX_HEIGHT = 900
const STAR_COUNT = 70
const TWINKLE_COUNT = 6

export const STARFIELD_VIEWBOX = `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`

export interface Star {
  cx: number
  cy: number
  r: number
  opacity: number
  twinkle: boolean
  /** Seconds, staggers twinkling stars so they don't pulse in lockstep. */
  delay: number
  /** Seconds, 3–6s per .impeccable.md. */
  duration: number
}

/**
 * Pure: ~70 pin-sharp stars for the sky's upper band, from a seeded PRNG —
 * same seed, same sky, every time. Placement is biased toward the top of
 * the band (fewer, dimmer stars survive near its bottom edge, where the
 * cloud banks start) rather than uniform, so nothing reads as scattered
 * confetti right down to the horizon.
 */
export function generateStars(seed: number, count: number = STAR_COUNT): Star[] {
  const rand = mulberry32(seed)
  const twinkleStride = Math.max(1, Math.floor(count / TWINKLE_COUNT))
  const stars: Star[] = []

  for (let i = 0; i < count; i++) {
    // pow(x, 1.6) skews the [0,1) draw toward 0 — more stars high in the
    // band, thinning out toward its lower edge.
    const verticalT = Math.pow(rand(), 1.6)
    const cy = verticalT * VIEWBOX_HEIGHT
    const fade = 1 - verticalT
    const opacity = Math.min(0.9, Math.max(0.25, 0.25 + fade * rand() * 0.65))

    stars.push({
      cx: rand() * VIEWBOX_WIDTH,
      cy,
      r: 0.5 + rand() * 0.9,
      opacity,
      twinkle: i % twinkleStride === 0,
      delay: rand() * 3,
      duration: 3 + rand() * 3,
    })
  }

  return stars
}
