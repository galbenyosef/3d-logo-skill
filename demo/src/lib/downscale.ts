export interface Dimensions {
  width: number
  height: number
}

/**
 * The one deliberate deviation from SKILL.md: user uploads are downscaled to
 * at most 1024px on the long side before any pixel processing, so phones
 * don't choke on a multi-megapixel photo. Sample logos ship pre-sized and
 * skip this step. Aspect ratio is preserved; images already within budget
 * are left untouched.
 */
export function computeDownscaleDimensions(width: number, height: number, maxSize = 1024): Dimensions {
  if (width <= maxSize && height <= maxSize) {
    return { width, height }
  }
  const scale = maxSize / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Vector sources (SVG) have no real pixel size: a viewBox-only SVG reports
 * the browser default of 150x150, and rasterizing it there made a soft coin
 * and a bogus "tiny image" warning. Scale vectors so the long side is
 * exactly `maxSize`, up or down; raster images keep the downscale-only rule.
 */
export function computeRasterDimensions(width: number, height: number, maxSize = 1024, isVector = false): Dimensions {
  if (!isVector) return computeDownscaleDimensions(width, height, maxSize)
  const scale = maxSize / Math.max(width, height, 1)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
