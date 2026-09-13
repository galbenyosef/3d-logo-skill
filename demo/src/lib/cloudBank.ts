import { mulberry32 } from './prng'

export interface CloudBankOptions {
  /** SVG user units — kept at a fixed 4:1 aspect (see styles.css `.cloud-bank`). */
  width?: number
  height?: number
  /** Where the biggest lumps' surface sits, before submersion (fraction of `height`). */
  baselineRatio?: number
  /** Big, wide-flat-arc lumps — the cloud's overall silhouette. */
  l1Count?: number
  /** Medium lobes riding the L1 surface. */
  l2Count?: number
  /** Small puffs riding the L2 surface — the texture that reads as "cumulus" up close. */
  l3Count?: number
  /** Sampling density: ~1 point per this many viewBox units, so small puffs stay round. */
  sampleSpacing?: number
}

export interface Point {
  x: number
  y: number
}

export interface CloudBankTile {
  width: number
  height: number
  /** The full (unshifted) silhouette, meant to be filled flat with the light "rim" colour. */
  litPath: string
  /** The same silhouette shifted down slightly, filled with the bank's own gradient and
   *  painted over `litPath` — the sliver of `litPath` left exposed above it is the lit
   *  edge: thick on flat crowns, thinning to nothing on steep flanks. */
  basePath: string
}

interface Lump {
  cx: number
  r: number
  cy: number
}

const DEFAULTS: Required<CloudBankOptions> = {
  width: 1200,
  height: 300,
  baselineRatio: 0.7,
  l1Count: 4,
  l2Count: 10,
  l3Count: 18,
  sampleSpacing: 2,
}

// Keeps every bump's crown at least this far from the tile's own top edge —
// past that, a circle's cap gets hard-clipped by the SVG's own box, which
// reads as a flat-topped rectangle instead of a rounded puff.
const MIN_TOP_MARGIN_RATIO = 0.06
// How far the base-fill silhouette sits below the lit one — this is the lit
// edge's thickness at a perfectly flat crown.
const LIT_EDGE_SHIFT = 5
// Extends both paths' bottom anchor past the tile's nominal height, purely
// as a sub-pixel safety margin: `background-size: auto 100%` maps a
// fractional `svh` height, and without this a hairline of the sky gradient
// behind the tile can show through at the very bottom edge.
const BOTTOM_OVERSCAN = 4

function wrappedDist(a: number, b: number, period: number): number {
  const d = Math.abs(a - b) % period
  return Math.min(d, period - d)
}

/** Evenly-spaced centres across [0, width) with jitter — avoids both clustering and long dead gaps. */
function placeCentres(rand: () => number, count: number, width: number): number[] {
  const spacing = width / count
  return Array.from({ length: count }, (_, i) => {
    const jitter = (rand() - 0.5) * spacing * 0.6
    const raw = (i + 0.5) * spacing + jitter
    return ((raw % width) + width) % width
  })
}

/** The topmost (smallest-y) surface formed by a set of circles, or `floor` where none reach. */
function envelopeAt(x: number, width: number, floor: number, lumps: readonly Lump[]): number {
  let y = floor
  for (const lump of lumps) {
    const dx = wrappedDist(x, lump.cx, width)
    if (dx < lump.r) {
      const candidate = lump.cy - Math.sqrt(lump.r * lump.r - dx * dx)
      if (candidate < y) y = candidate
    }
  }
  return y
}

/**
 * One level of the hierarchy: circles placed across the tile, each
 * "submerged" below the surface it sits on (its centre lies *below* that
 * surface by a fraction of its own radius) — so each bump exposes only a
 * shallow cap of its circle: a wide, flattened arc, never a full round
 * bubble.
 */
function buildLevel(
  rand: () => number,
  count: number,
  minR: number,
  maxR: number,
  width: number,
  submergeMin: number,
  submergeMax: number,
  surfaceBelow: (x: number) => number,
): Lump[] {
  return placeCentres(rand, count, width).map((cx) => {
    const r = minR + rand() * (maxR - minR)
    const submerge = submergeMin + rand() * (submergeMax - submergeMin)
    return { cx, r, cy: surfaceBelow(cx) + submerge * r }
  })
}

/**
 * Pure: a hierarchical cumulus profile on a periodic (wrapped) x domain, so
 * it tiles with no seam — big lumps, with medium lobes riding their
 * surface, with small puffs riding those. Guarantees every point clears
 * `MIN_TOP_MARGIN_RATIO * height` from the tile's own top edge, shifting
 * the whole profile down if needed, so nothing gets hard-clipped into a
 * flat-topped rectangle.
 */
export function generateBankProfile(seed: number, options: CloudBankOptions = {}): Point[] {
  const { width, height, baselineRatio, l1Count, l2Count, l3Count, sampleSpacing } = {
    ...DEFAULTS,
    ...options,
  }
  const rand = mulberry32(seed)
  const baseline = height * baselineRatio

  const l1 = buildLevel(rand, l1Count, 0.3 * height, 0.45 * height, width, 0.15, 0.35, () => baseline)
  const l2 = buildLevel(rand, l2Count, 0.1 * height, 0.2 * height, width, 0.35, 0.35, (x) =>
    envelopeAt(x, width, baseline, l1),
  )
  const l1l2 = [...l1, ...l2]
  const l3 = buildLevel(rand, l3Count, 0.035 * height, 0.08 * height, width, 0.35, 0.35, (x) =>
    envelopeAt(x, width, baseline, l1l2),
  )

  const allLumps = [...l1l2, ...l3]
  const steps = Math.max(8, Math.round(width / sampleSpacing))
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width
    points.push({ x, y: envelopeAt(x, width, baseline, allLumps) })
  }

  const minY = Math.min(...points.map((p) => p.y))
  const minMargin = height * MIN_TOP_MARGIN_RATIO
  if (minY < minMargin) {
    const shift = minMargin - minY
    for (const p of points) p.y += shift
  }

  return points
}

function fmt(n: number): string {
  return n.toFixed(2)
}

function pathFromProfile(profile: Point[], height: number, yOffset: number): string {
  const bottom = height + BOTTOM_OVERSCAN
  const first = profile[0]
  const last = profile[profile.length - 1]
  const top = profile.map((p) => `L${fmt(p.x)},${fmt(p.y + yOffset)}`).join(' ')
  return `M0,${fmt(bottom)} L0,${fmt(first.y + yOffset)} ${top} L${fmt(last.x)},${fmt(bottom)} Z`
}

/**
 * Pure: builds the lit (flat rim-colour fill, unshifted) and base
 * (gradient fill, shifted down `LIT_EDGE_SHIFT`) paths for one tile. Draw
 * `litPath` first, `basePath` on top of it — never stroke either, a stroke
 * on the closed shape draws the straight left/right edges too, which show
 * up as vertical lines at every tile seam once repeated.
 */
export function generateCloudBankTile(seed: number, options: CloudBankOptions = {}): CloudBankTile {
  const width = options.width ?? DEFAULTS.width
  const height = options.height ?? DEFAULTS.height
  const profile = generateBankProfile(seed, { ...options, width, height })

  return {
    width,
    height,
    litPath: pathFromProfile(profile, height, 0),
    basePath: pathFromProfile(profile, height, LIT_EDGE_SHIFT),
  }
}

/** Mixes a hex colour toward white by `amount` (0–1). */
function lighten(hex: string, amount: number): string {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Data-URI-ready inline SVG markup for one tile: a flat `rimColor` fill
 * (the lit edge, exposed only as a thin crescent), topped by `fillColor` in
 * a subtle vertical gradient — a touch lighter right under the lit edge,
 * settling to flat `fillColor` for the lower 60% of the tile (so, e.g., the
 * near bank's fill matches screen 2's flat background exactly).
 */
export function cloudBankTileSvg(
  seed: number,
  options: CloudBankOptions & { fillColor: string; rimColor: string },
): string {
  const { fillColor, rimColor, ...tileOptions } = options
  const { width, height, litPath, basePath } = generateCloudBankTile(seed, tileOptions)
  const gradId = `bank-grad-${Math.abs(seed)}`
  const topColor = lighten(fillColor, 0.18)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${topColor}"/>` +
    `<stop offset="40%" stop-color="${fillColor}"/>` +
    `<stop offset="100%" stop-color="${fillColor}"/>` +
    `</linearGradient></defs>` +
    `<path d="${litPath}" fill="${rimColor}"/>` +
    `<path d="${basePath}" fill="url(#${gradId})"/>` +
    `</svg>`
  )
}
