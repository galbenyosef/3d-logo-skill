/**
 * Pure `object-fit: cover` + `object-position` math, shared by the painted
 * sky plate's CSS (which the browser applies natively) and the breeze
 * shader (SkyBreeze.tsx), which has to reproduce the exact same mapping in
 * GLSL to sample the same pixel the `<img>` shows underneath it. Keeping
 * the formula in one tested module means both call sites — and this
 * file's own tests — agree on where the painted sun disc actually lands.
 *
 * Convention throughout: uv is (0,0) at the top-left, (1,1) at the
 * bottom-right — "y-down", matching CSS/DOM coordinates (and, with
 * UNPACK_FLIP_Y_WEBGL enabled, the shader's texture sampling too).
 */

export interface Size {
  width: number
  height: number
}

export interface UV {
  x: number
  y: number
}

/** `object-position: 50% 50%` — centered, the default for both plates. */
export const DEFAULT_OBJECT_POSITION: UV = { x: 0.5, y: 0.5 }

/** Painted sun disc centre in the landscape plate's own image-space uv. */
export const SUN_IMAGE_UV_LANDSCAPE: UV = { x: 0.645, y: 0.635 }

/** Painted sun disc centre in the portrait plate's own image-space uv — horizontally centred. */
export const SUN_IMAGE_UV_PORTRAIT: UV = { x: 0.5, y: 0.635 }

/** Painted sun disc radius, as a fraction of the landscape plate's width. */
export const SUN_RADIUS_RATIO = 0.155

/** The same disc as a fraction of the portrait plate's width: that crop is
    half the source height wide (5504x3072 source -> 1536 wide), so the
    identical disc covers 5504/1536 times more of it. */
export const SUN_RADIUS_RATIO_PORTRAIT = SUN_RADIUS_RATIO * (5504 / 1536)

/** Picks the right sun uv for whichever plate `image` describes (landscape vs portrait). */
export function sunImageUvFor(image: Size): UV {
  return image.width >= image.height ? SUN_IMAGE_UV_LANDSCAPE : SUN_IMAGE_UV_PORTRAIT
}

export interface CoverMapping {
  /** How much the image is scaled up (rendered px per image px) to cover the container. */
  scale: number
  /** Image-space uv that the container's own (0,0) (top-left) corner maps to. */
  offset: UV
  /** Image-space uv span covered by the container's full width/height. */
  span: UV
}

/**
 * The `object-fit: cover` + `object-position` mapping between a container
 * box and the image it crops to fill it. Mirrors the CSS spec exactly:
 * scale up-to-cover on the tighter axis, then slide the overflow by
 * `position` (0 = crop from the position's own edge, 1 = crop from the
 * opposite edge, 0.5 = crop evenly from both).
 */
export function computeCoverMapping(container: Size, image: Size, position: UV = DEFAULT_OBJECT_POSITION): CoverMapping {
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { scale: 1, offset: { x: 0, y: 0 }, span: { x: 1, y: 1 } }
  }

  const containerAspect = container.width / container.height
  const imageAspect = image.width / image.height

  let renderWidth: number
  let renderHeight: number
  if (imageAspect > containerAspect) {
    // Image is relatively wider than the container: match heights, crop the sides.
    renderHeight = container.height
    renderWidth = renderHeight * imageAspect
  } else {
    // Image is relatively taller (or equal): match widths, crop top/bottom.
    renderWidth = container.width
    renderHeight = renderWidth / imageAspect
  }

  const scale = renderWidth / image.width
  const excessX = renderWidth - container.width
  const excessY = renderHeight - container.height

  const offsetX = (excessX * position.x) / scale / image.width
  const offsetY = (excessY * position.y) / scale / image.height
  const spanX = container.width / (scale * image.width)
  const spanY = container.height / (scale * image.height)

  return { scale, offset: { x: offsetX, y: offsetY }, span: { x: spanX, y: spanY } }
}

/** Screen-space uv (0..1 across the container) -> image-space uv, per `object-fit: cover`. */
export function screenToImageUv(screenUv: UV, container: Size, image: Size, position: UV = DEFAULT_OBJECT_POSITION): UV {
  const m = computeCoverMapping(container, image, position)
  return {
    x: m.offset.x + screenUv.x * m.span.x,
    y: m.offset.y + screenUv.y * m.span.y,
  }
}

/**
 * Image-space uv -> screen-space uv. Values outside [0,1] mean that point
 * of the image was cropped away and never lands on screen at this size.
 */
export function imageToScreenUv(imageUv: UV, container: Size, image: Size, position: UV = DEFAULT_OBJECT_POSITION): UV {
  const m = computeCoverMapping(container, image, position)
  return {
    x: (imageUv.x - m.offset.x) / m.span.x,
    y: (imageUv.y - m.offset.y) / m.span.y,
  }
}

/**
 * Parses a computed `object-position` value ("50% 50%") into 0-1 fractions.
 * Only the percentage-pair form is supported — the only form this app ever
 * sets — so anything else (keywords, mixed units, a bad string) falls back
 * to `fallback` rather than throwing.
 */
export function parseObjectPosition(value: string, fallback: UV = DEFAULT_OBJECT_POSITION): UV {
  const parts = value.trim().split(/\s+/)
  if (parts.length < 2) return fallback

  const parsePercent = (s: string): number | null => {
    const m = /^(-?[\d.]+)%$/.exec(s)
    return m ? parseFloat(m[1]) / 100 : null
  }

  const x = parsePercent(parts[0])
  const y = parsePercent(parts[1])
  if (x === null || y === null) return fallback
  return { x, y }
}
