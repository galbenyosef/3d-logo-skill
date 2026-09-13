import { mulberry32 } from './prng'

export interface CloudBankOptions {
  /** SVG user units — kept at a fixed 4:1 aspect (see styles.css `.cloud-bank`). */
  width?: number
  height?: number
  /** Where the biggest lumps' surface sits, before submersion (fraction of `height`). */
  baselineRatio?: number
  /** Medium lobes riding the L1 surface. */
  l2Count?: number
  /** Small puffs riding the L2 surface — the texture that reads as "cumulus" up close. */
  l3Count?: number
  /** L1 (big lump) radius range, fraction of `height`. */
  l1MinRadiusRatio?: number
  l1MaxRadiusRatio?: number
  /** L2 (medium lobe) radius range, fraction of `height`. */
  l2MinRadiusRatio?: number
  l2MaxRadiusRatio?: number
  /** L3 (small puff) radius range, fraction of `height`. Bigger + fewer reads "less spiky". */
  l3MinRadiusRatio?: number
  l3MaxRadiusRatio?: number
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
  l2Count: 10,
  l3Count: 18,
  l1MinRadiusRatio: 0.3,
  l1MaxRadiusRatio: 0.45,
  l2MinRadiusRatio: 0.1,
  l2MaxRadiusRatio: 0.2,
  l3MinRadiusRatio: 0.035,
  l3MaxRadiusRatio: 0.08,
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
// Polynomial-smin kernel width (fraction of height) that rounds every
// junction between competing surfaces — the L1/baseline seam, an L2 lobe
// meeting the L1 it rides on, an L3 puff meeting its L2 — instead of the
// hard `min()` corner a bare `Math.min` produces there.
const SMIN_K_RATIO = 0.05
// L2/L3 submersion: a circle's centre sits this far *below* the topmost
// point of the surface across its own full footprint, so its underside
// never floats above a neighbour — the fix for the sheer vertical cliffs a
// point-sampled (rather than span-sampled) submersion reference produced.
const RIDE_SUBMERGE = 0.2
// L1 neighbour-centre spacing, as a multiple of the walking lump's own
// radius — kept comfortably under ~1.3x so consecutive lumps always
// overlap and no bare flat baseline can show between them.
const L1_GAP_MIN = 0.9
const L1_GAP_MAX = 1.25
// Final cliff guard, as a fraction of height: a circle contributes nothing
// the instant `dx` passes its radius, so however well its centre is placed,
// the sampled surface can still drop sharply right where it stops being the
// topmost contributor. Slope-limiting the sampled curve afterward rounds
// exactly that "cliff" edge without touching the overall silhouette.
const MAX_SLOPE_RATIO = 0.036

function wrappedDist(a: number, b: number, period: number): number {
  const d = Math.abs(a - b) % period
  return Math.min(d, period - d)
}

/** Polynomial smooth-min (quadratic) — reduces to `Math.min` once |a-b| >= k. */
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/**
 * The topmost (smallest-y) surface formed by a set of circles plus `floor`,
 * with every competing pair blended by `smin` so the junction between them
 * is a rounded corner, not a hard min() kink. `k=0` gives the exact
 * (unrounded) envelope — used internally wherever the *true* topmost point
 * is needed (e.g. deciding where the next lump should sit), as opposed to
 * the final rendered/sampled surface.
 */
function envelopeAt(x: number, width: number, floor: number, lumps: readonly Lump[], k: number): number {
  let y = floor
  for (const lump of lumps) {
    const dx = wrappedDist(x, lump.cx, width)
    if (dx < lump.r) {
      const candidate = lump.cy - Math.sqrt(lump.r * lump.r - dx * dx)
      y = smin(y, candidate, k)
    }
  }
  return y
}

/**
 * Slope-limits a periodic sample array in place (last point duplicates the
 * first) so no two adjacent samples differ by more than `maxDy` — the
 * actual cliff guard. `smin` rounds *value* discontinuities between two
 * competing surfaces, but a circle contributing nothing past its own edge
 * is a *domain* discontinuity smin can't touch: right at dx=r a lump can
 * still be the topmost surface, and the sample just past it can fall back
 * to something far lower with no competing candidate to blend against.
 * Repeated forward/backward clamping sweeps (standard Lipschitz
 * regularization) remove that without reshaping the rest of the profile.
 */
function limitSlopeCyclic(points: Point[], maxDy: number, passes: number): void {
  const n = points.length - 1
  if (n <= 1) return
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n].y
      points[i].y = Math.min(Math.max(points[i].y, prev - maxDy), prev + maxDy)
    }
    for (let i = n - 1; i >= 0; i--) {
      const next = points[(i + 1) % n].y
      points[i].y = Math.min(Math.max(points[i].y, next - maxDy), next + maxDy)
    }
  }
  points[points.length - 1].y = points[0].y
}

/** The exact (unrounded) topmost point of `envelopeAt` sampled across a circle's own [cx-r, cx+r] footprint. */
function spanMin(cx: number, r: number, width: number, floor: number, lumps: readonly Lump[]): number {
  const samples = 9
  let m = Infinity
  for (let i = 0; i < samples; i++) {
    const x = cx - r + (2 * r * i) / (samples - 1)
    const y = envelopeAt(x, width, floor, lumps, 0)
    if (y < m) m = y
  }
  return m
}

/**
 * L1: big lumps walked around the tile so consecutive centres are always
 * <= ~1.3x the walking lump's own radius apart — close enough that
 * neighbours always overlap, so no stretch of bare flat baseline ever
 * shows between them (the fix for isolated lumps sitting over open gaps).
 * Each lump's centre still submerges below the constant `baseline` — L1's
 * "surface below" is the flat sky line itself, not another lump's profile.
 */
function buildL1(
  rand: () => number,
  minR: number,
  maxR: number,
  width: number,
  baseline: number,
  submergeMin: number,
  submergeMax: number,
): Lump[] {
  const lumps: Lump[] = []
  let cx = rand() * width
  let covered = 0
  let guard = 0
  while (covered < width && guard < 400) {
    guard++
    const r = minR + rand() * (maxR - minR)
    const submerge = submergeMin + rand() * (submergeMax - submergeMin)
    const posX = ((cx % width) + width) % width
    lumps.push({ cx: posX, r, cy: baseline + submerge * r })
    const gap = (L1_GAP_MIN + rand() * (L1_GAP_MAX - L1_GAP_MIN)) * r
    cx += gap
    covered += gap
  }
  return lumps
}

/**
 * L2/L3: circles "riding" the surface built by the level(s) below them.
 * Each one's centre sits `RIDE_SUBMERGE * r` below the *topmost* point of
 * that surface across its own full [cx-r, cx+r] footprint (not just a
 * single point sample at cx) — so its underside is guaranteed to be at or
 * below the surface everywhere it overlaps, and it can never float above a
 * dip just outside its centre (the cliff bug: a point-sampled reference let
 * a lobe centred on a locally-high part of the envelope end its circle high
 * above the (lower) surface right next to it).
 */
function buildRidingLevel(
  rand: () => number,
  count: number,
  minR: number,
  maxR: number,
  width: number,
  floor: number,
  below: readonly Lump[],
): Lump[] {
  const spacing = width / count
  const lumps: Lump[] = []
  for (let i = 0; i < count; i++) {
    const jitter = (rand() - 0.5) * spacing * 0.6
    const raw = (i + 0.5) * spacing + jitter
    const cx = ((raw % width) + width) % width
    const r = minR + rand() * (maxR - minR)
    const surface = spanMin(cx, r, width, floor, below)
    lumps.push({ cx, r, cy: surface + RIDE_SUBMERGE * r })
  }
  return lumps
}

/**
 * Pure: a hierarchical cumulus profile on a periodic (wrapped) x domain, so
 * it tiles with no seam — big lumps (walked so they always overlap), with
 * medium lobes riding their surface, with small puffs riding those, every
 * junction rounded by a polynomial smin. Guarantees every point clears
 * `MIN_TOP_MARGIN_RATIO * height` from the tile's own top edge, shifting
 * the whole profile down if needed, so nothing gets hard-clipped into a
 * flat-topped rectangle.
 */
export function generateBankProfile(seed: number, options: CloudBankOptions = {}): Point[] {
  const {
    width,
    height,
    baselineRatio,
    l2Count,
    l3Count,
    l1MinRadiusRatio,
    l1MaxRadiusRatio,
    l2MinRadiusRatio,
    l2MaxRadiusRatio,
    l3MinRadiusRatio,
    l3MaxRadiusRatio,
    sampleSpacing,
  } = { ...DEFAULTS, ...options }
  const rand = mulberry32(seed)
  const baseline = height * baselineRatio
  const k = height * SMIN_K_RATIO

  const l1 = buildL1(rand, l1MinRadiusRatio * height, l1MaxRadiusRatio * height, width, baseline, 0.15, 0.35)
  const l2 = buildRidingLevel(rand, l2Count, l2MinRadiusRatio * height, l2MaxRadiusRatio * height, width, baseline, l1)
  const l1l2 = [...l1, ...l2]
  const l3 = buildRidingLevel(rand, l3Count, l3MinRadiusRatio * height, l3MaxRadiusRatio * height, width, baseline, l1l2)

  const allLumps = [...l1l2, ...l3]
  const steps = Math.max(8, Math.round(width / sampleSpacing))
  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width
    points.push({ x, y: envelopeAt(x, width, baseline, allLumps, k) })
  }

  limitSlopeCyclic(points, height * MAX_SLOPE_RATIO, 6)

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
 * a subtle vertical gradient — `topColor` (default: `fillColor` lightened
 * 18% toward white) right under the lit edge, settling to flat `fillColor`
 * by 40% of the tile's height and staying flat for the remaining 60% (so,
 * e.g., the near bank's fill matches screen 2's flat background exactly).
 */
export function cloudBankTileSvg(
  seed: number,
  options: CloudBankOptions & { fillColor: string; rimColor: string; topColor?: string },
): string {
  const { fillColor, rimColor, topColor, ...tileOptions } = options
  const { width, height, litPath, basePath } = generateCloudBankTile(seed, tileOptions)
  const gradId = `bank-grad-${Math.abs(seed)}`
  const resolvedTopColor = topColor ?? lighten(fillColor, 0.18)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${resolvedTopColor}"/>` +
    `<stop offset="40%" stop-color="${fillColor}"/>` +
    `<stop offset="100%" stop-color="${fillColor}"/>` +
    `</linearGradient></defs>` +
    `<path d="${litPath}" fill="${rimColor}"/>` +
    `<path d="${basePath}" fill="url(#${gradId})"/>` +
    `</svg>`
  )
}
