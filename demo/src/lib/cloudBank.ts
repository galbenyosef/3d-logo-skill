import { mulberry32 } from './prng'

export interface CloudBankOptions {
  /** SVG user units — kept at a fixed 4:1 aspect (see styles.css `.cloud-bank`). */
  width?: number
  height?: number
  /** How many circular bumps make up the top edge. */
  bumpCount?: number
  /** Bump radius range, as a fraction of `height`. */
  minBumpRadius?: number
  maxBumpRadius?: number
  /** Where the flat top edge sits (fraction of `height`) before any bump rises above it. */
  baselineRatio?: number
  /** How many points sample the top edge — more = smoother arcs. */
  steps?: number
}

export interface Point {
  x: number
  y: number
}

export interface CloudBankTile {
  width: number
  height: number
  /** Closed path (top edge + bottom edge), fill only — never stroke this, see rimPath. */
  fillPath: string
  /** Open path tracing only the top edge, stroke only. */
  rimPath: string
}

interface Bump {
  cx: number
  r: number
}

const DEFAULTS: Required<CloudBankOptions> = {
  width: 1200,
  height: 300,
  bumpCount: 8,
  minBumpRadius: 0.35,
  maxBumpRadius: 0.75,
  baselineRatio: 0.78,
  steps: 72,
}

/** Shortest distance between two points on a circle of the given circumference. */
function wrappedDist(a: number, b: number, period: number): number {
  const d = Math.abs(a - b) % period
  return Math.min(d, period - d)
}

/**
 * Pure: the top edge of one seamlessly-tiling cloud-bank tile, as sampled
 * points. Bumps are placed on a periodic domain (`wrappedDist` treats x=0
 * and x=width as the same point), so the profile evaluated at x=0 and at
 * x=width is always identical — the tile can `background-repeat: repeat-x`
 * with no visible seam.
 */
export function generateBankProfile(seed: number, options: CloudBankOptions = {}): Point[] {
  const { width, height, bumpCount, minBumpRadius, maxBumpRadius, baselineRatio, steps } = {
    ...DEFAULTS,
    ...options,
  }
  const rand = mulberry32(seed)
  const bumps: Bump[] = Array.from({ length: bumpCount }, () => ({
    cx: rand() * width,
    r: (minBumpRadius + rand() * (maxBumpRadius - minBumpRadius)) * height,
  }))
  const baseline = height * baselineRatio

  const points: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width
    let bumpHeight = 0
    for (const bump of bumps) {
      const dx = wrappedDist(x, bump.cx, width)
      if (dx < bump.r) {
        const h = Math.sqrt(bump.r * bump.r - dx * dx)
        if (h > bumpHeight) bumpHeight = h
      }
    }
    points.push({ x, y: baseline - bumpHeight })
  }
  return points
}

function fmt(n: number): string {
  return n.toFixed(2)
}

/**
 * Pure: builds the fill (closed, bottom-anchored silhouette) and rim (open,
 * top-edge-only) SVG paths for one tile. The fill path is never stroked —
 * stroking it would draw the straight left/right edges too, which show up
 * as vertical lines at every tile seam once repeated.
 */
export function generateCloudBankTile(seed: number, options: CloudBankOptions = {}): CloudBankTile {
  const width = options.width ?? DEFAULTS.width
  const height = options.height ?? DEFAULTS.height
  const profile = generateBankProfile(seed, { ...options, width, height })

  const rimPath = profile.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)},${fmt(p.y)}`).join(' ')
  const topEdge = profile.map((p) => `L${fmt(p.x)},${fmt(p.y)}`).join(' ')
  const fillPath = `M0,${fmt(height)} L0,${fmt(profile[0].y)} ${topEdge} L${fmt(width)},${fmt(height)} Z`

  return { width, height, fillPath, rimPath }
}

/** Data-URI-ready inline SVG markup for one tile: unstroked fill + stroked rim. */
export function cloudBankTileSvg(
  seed: number,
  options: CloudBankOptions & { fillColor: string; rimColor: string; rimOpacity?: number; rimWidth?: number },
): string {
  const { fillColor, rimColor, rimOpacity = 1, rimWidth = 2, ...tileOptions } = options
  const { width, height, fillPath, rimPath } = generateCloudBankTile(seed, tileOptions)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<path d="${fillPath}" fill="${fillColor}"/>` +
    `<path d="${rimPath}" fill="none" stroke="${rimColor}" stroke-opacity="${rimOpacity}" stroke-width="${rimWidth}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  )
}
