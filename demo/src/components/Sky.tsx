import { useMemo } from 'react'
import { cloudBankTileSvg } from '../lib/cloudBank'
import { generateStars, STARFIELD_VIEWBOX } from '../lib/starfield'

// Fixed seeds: the sky is deterministic, not reshuffled on every mount.
const STAR_SEED = 1337

// Nearer = darker, bigger, chunkier lumps. The near bank's fill MUST stay
// exactly --sky-top — that's what makes screen 1 sink into screen 2 with no
// seam band (see .impeccable.md / styles.css `.screen-2`), guaranteed here
// by cloudBankTileSvg's gradient (flat fillColor for the lower 60%). Its
// topColor is a fixed, slightly-lighter navy rather than the auto-lightened
// default — a distinct silhouette instead of fading into fog against the
// mid bank behind it.
const BANKS = [
  {
    className: 'cloud-bank-far',
    seed: 41,
    fillColor: '#a283b8',
    rimColor: '#ffe6d2',
    baselineRatio: 0.66,
    l2Count: 8,
    l3Count: 14,
  },
  {
    className: 'cloud-bank-mid',
    seed: 42,
    fillColor: '#4f4a91',
    rimColor: '#ffe6d2',
    baselineRatio: 0.6,
    l2Count: 10,
    l3Count: 18,
  },
  {
    className: 'cloud-bank-near',
    seed: 43,
    fillColor: '#14163a',
    rimColor: '#ffe6d2',
    topColor: '#262857',
    baselineRatio: 0.42,
    l2Count: 11,
    // Fewer, bigger L3 puffs than the other banks — less spiky, reads as
    // one solid ridge rather than a fringe of tiny teeth.
    l3Count: 13,
    l3MinRadiusRatio: 0.06,
    l3MaxRadiusRatio: 0.12,
  },
] as const

// A static feTurbulence tile — kills gradient banding without ever touching
// `filter: blur` (see .impeccable.md "crisp over soft").
const GRAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">' +
  '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter>' +
  '<rect width="100%" height="100%" filter="url(#n)"/></svg>'

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/**
 * "Crisp horizon" skybox behind screen 1: gradient, a hand-placed starfield,
 * a hard-edged sun (positioned by App's useSunPosition hook via --sun-x/y/r
 * on .screen-1), three lit cloud banks, and a grain overlay to kill
 * gradient banding. Purely decorative — aria-hidden and pointer-events:none
 * throughout. No `filter: blur` anywhere in this tree (.impeccable.md
 * "crisp over soft" — softness comes from colour, not blur).
 */
export function Sky() {
  const stars = useMemo(() => generateStars(STAR_SEED), [])
  const bankSvgs = useMemo(
    () =>
      BANKS.map((bank) => ({
        className: bank.className,
        svg: cloudBankTileSvg(bank.seed, bank),
      })),
    [],
  )

  return (
    <div className="sky" aria-hidden="true">
      <div className="sky-vignette-top" />

      <svg className="sky-stars" viewBox={STARFIELD_VIEWBOX} preserveAspectRatio="xMidYMin slice">
        {stars.map((star, i) => (
          <circle
            key={i}
            cx={star.cx}
            cy={star.cy}
            r={star.r}
            fill="var(--cloud)"
            opacity={star.opacity}
            className={star.twinkle ? 'sky-star-twinkle' : undefined}
            style={
              star.twinkle
                ? { animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` }
                : undefined
            }
          />
        ))}
      </svg>

      <div className="sky-sun-halo" />
      <div className="sky-sun" />

      {bankSvgs.map((bank) => (
        <div key={bank.className} className={`cloud-bank ${bank.className}`} style={{ backgroundImage: svgUrl(bank.svg) }} />
      ))}

      <div className="sky-grain" style={{ backgroundImage: svgUrl(GRAIN_SVG) }} />
    </div>
  )
}
