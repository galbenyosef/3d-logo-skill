import { computeRasterDimensions } from './downscale'

/** Loads a File as an HTMLImageElement via a local object URL. Rejects on decode failure. */
function readFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image.'))
    }
    img.src = url
  })
}

export interface UploadedLogo {
  /** Local object URL for the (possibly downscaled) processed image. */
  url: string
  /** The ORIGINAL image's natural width, before any downscaling. */
  width: number
  /** The ORIGINAL image's natural height, before any downscaling. */
  height: number
  /** True for SVG: it was rasterized at full size, so its natural size says nothing about sharpness. */
  isVector: boolean
}

/**
 * Downscales an uploaded image to at most `maxSize` on the long side (default
 * 1024) and returns a local object URL for it, plus the image's original
 * (pre-downscale) natural dimensions — callers use those to warn when a
 * genuinely tiny source (e.g. a 16x16 favicon) will look soft blown up onto
 * a coin. The image never leaves the browser — everything happens on an
 * offscreen canvas.
 */
export async function prepareUploadedLogo(file: File, maxSize = 1024): Promise<UploadedLogo> {
  const img = await readFileAsImage(file)
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height
  const isVector = file.type === 'image/svg+xml'
  const { width, height } = computeRasterDimensions(naturalWidth, naturalHeight, maxSize, isVector)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not supported in this browser.')
  ctx.drawImage(img, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not process that image.'))
        return
      }
      resolve({ url: URL.createObjectURL(blob), width: naturalWidth, height: naturalHeight, isVector })
    }, 'image/png')
  })
}
