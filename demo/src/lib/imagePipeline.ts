import { computeDownscaleDimensions } from './downscale'

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

/**
 * Downscales an uploaded image to at most `maxSize` on the long side (default
 * 1024) and returns a local object URL for it. The image never leaves the
 * browser — everything happens on an offscreen canvas.
 */
export async function prepareUploadedLogo(file: File, maxSize = 1024): Promise<string> {
  const img = await readFileAsImage(file)
  const { width, height } = computeDownscaleDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, maxSize)
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
      resolve(URL.createObjectURL(blob))
    }, 'image/png')
  })
}
