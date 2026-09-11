const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

/** Whether a File's MIME type is one this demo knows how to turn into a coin. */
export function isAllowedImageType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase())
}
